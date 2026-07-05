package service

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/sandershome/server/internal/db"
)

type GatusService struct {
	db     *db.DB
	client *http.Client
}

func NewGatusService(database *db.DB) *GatusService {
	return &GatusService{
		db:     database,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

type GatusEndpoint struct {
	Name    string        `json:"name"`
	Group   string        `json:"group"`
	Key     string        `json:"key"`
	Results []GatusResult `json:"results"`
}

type GatusResult struct {
	Status    int       `json:"status"`
	Hostname  string    `json:"hostname"`
	Duration  int64     `json:"duration"`
	Success   bool      `json:"success"`
	Timestamp time.Time `json:"timestamp"`
}

type GatusStatus struct {
	Total    int                   `json:"total"`
	Healthy  int                   `json:"healthy"`
	Unstable int                   `json:"unstable"`
	Failing  int                   `json:"failing"`
	Services []GatusServiceSummary `json:"services"`
}

type GatusServiceSummary struct {
	Name   string `json:"name"`
	Group  string `json:"group"`
	Status string `json:"status"`
}

func (s *GatusService) getURL() (string, error) {
	var raw string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'gatus_url'`).Scan(&raw)
	if err != nil || strings.TrimSpace(raw) == "" {
		return "", fmt.Errorf("gatus URL not configured — add it in Settings")
	}
	return strings.Trim(strings.TrimSpace(raw), `"`), nil
}

func (s *GatusService) GetStatus(ctx context.Context) (*GatusStatus, error) {
	baseURL, err := s.getURL()
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, baseURL+"/api/v1/endpoints/statuses", nil)
	if err != nil {
		return nil, err
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("gatus unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gatus returned %d", resp.StatusCode)
	}

	var endpoints []GatusEndpoint
	if err := json.NewDecoder(resp.Body).Decode(&endpoints); err != nil {
		return nil, fmt.Errorf("decode gatus response: %w", err)
	}

	status := &GatusStatus{
		Total: len(endpoints),
	}

	for _, ep := range endpoints {
		svcStatus := classifyHealth(ep.Results)

		status.Services = append(status.Services, GatusServiceSummary{
			Name:   ep.Name,
			Group:  ep.Group,
			Status: svcStatus,
		})

		switch svcStatus {
		case "healthy":
			status.Healthy++
		case "unstable":
			status.Unstable++
		case "failing":
			status.Failing++
		}
	}

	return status, nil
}

func classifyHealth(results []GatusResult) string {
	if len(results) == 0 {
		return "healthy"
	}
	if !results[len(results)-1].Success {
		return "failing"
	}
	for _, r := range results {
		if !r.Success {
			return "unstable"
		}
	}
	return "healthy"
}
