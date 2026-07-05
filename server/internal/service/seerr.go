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

type SeerrService struct {
	db     *db.DB
	client *http.Client
}

func NewSeerrService(database *db.DB) *SeerrService {
	return &SeerrService{
		db:     database,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

type SeerrConfig struct {
	URL    string
	APIKey string
}

func (s *SeerrService) getConfig() (*SeerrConfig, error) {
	var url, apiKey string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'seerr_url'`).Scan(&url)
	if err != nil || strings.TrimSpace(url) == "" {
		return nil, fmt.Errorf("seerr URL not configured — add it in Settings")
	}
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'seerr_api_key'`).Scan(&apiKey)

	return &SeerrConfig{
		URL:    strings.Trim(strings.TrimSpace(url), `"`),
		APIKey: strings.Trim(strings.TrimSpace(apiKey), `"`),
	}, nil
}

type seerrRequestsResponse struct {
	PageInfo struct {
		Results int `json:"results"`
	} `json:"pageInfo"`
	Results []seerrRequest `json:"results"`
}

type seerrRequest struct {
	ID   int    `json:"id"`
	Type string `json:"type"`
	Media struct {
		TmdbID int `json:"tmdbId"`
	} `json:"media"`
	RequestedBy struct {
		DisplayName string `json:"displayName"`
		Email       string `json:"email"`
	} `json:"requestedBy"`
}

type SeerrPendingItem struct {
	Title       string `json:"title"`
	MediaType   string `json:"mediaType"`
	RequestedBy string `json:"requestedBy"`
}

type SeerrStatus struct {
	Pending      int                `json:"pending"`
	Approved     int                `json:"approved"`
	PendingItems []SeerrPendingItem `json:"pendingItems"`
}

func (s *SeerrService) GetRequests(ctx context.Context) (*SeerrStatus, error) {
	cfg, err := s.getConfig()
	if err != nil {
		return nil, err
	}

	approvedCount, err := s.fetchCount(ctx, cfg, "approved")
	if err != nil {
		return nil, err
	}

	pendingResp, err := s.fetchRequests(ctx, cfg, "pending")
	if err != nil {
		return nil, err
	}

	items := make([]SeerrPendingItem, 0, len(pendingResp.Results))
	for _, r := range pendingResp.Results {
		mediaType := r.Type
		title := s.fetchMediaTitle(ctx, cfg, mediaType, r.Media.TmdbID)
		requestor := r.RequestedBy.DisplayName
		if requestor == "" {
			requestor = r.RequestedBy.Email
		}
		items = append(items, SeerrPendingItem{
			Title:       title,
			MediaType:   mediaType,
			RequestedBy: requestor,
		})
	}

	return &SeerrStatus{
		Pending:      pendingResp.PageInfo.Results,
		Approved:     approvedCount,
		PendingItems: items,
	}, nil
}

func (s *SeerrService) fetchCount(ctx context.Context, cfg *SeerrConfig, filter string) (int, error) {
	resp, err := s.fetchRequests(ctx, cfg, filter)
	if err != nil {
		return 0, err
	}
	return resp.PageInfo.Results, nil
}

func (s *SeerrService) fetchRequests(ctx context.Context, cfg *SeerrConfig, filter string) (*seerrRequestsResponse, error) {
	take := "1"
	if filter == "pending" {
		take = "20"
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		cfg.URL+"/api/v1/request?take="+take+"&skip=0&sort=added&filter="+filter, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-Api-Key", cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("seerr unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("seerr returned %d", resp.StatusCode)
	}

	var data seerrRequestsResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, fmt.Errorf("decode seerr response: %w", err)
	}
	return &data, nil
}

func (s *SeerrService) fetchMediaTitle(ctx context.Context, cfg *SeerrConfig, mediaType string, tmdbID int) string {
	if tmdbID == 0 {
		return "Untitled"
	}

	endpoint := "movie"
	if mediaType == "tv" {
		endpoint = "tv"
	}
	url := fmt.Sprintf("%s/api/v1/%s/%d", cfg.URL, endpoint, tmdbID)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "Unknown"
	}
	req.Header.Set("X-Api-Key", cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return "Unknown"
	}
	defer resp.Body.Close()

	var data struct {
		Title         string `json:"title"`
		Name          string `json:"name"`
		OriginalTitle string `json:"originalTitle"`
		OriginalName  string `json:"originalName"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "Unknown"
	}

	if data.Title != "" {
		return data.Title
	}
	if data.Name != "" {
		return data.Name
	}
	if data.OriginalTitle != "" {
		return data.OriginalTitle
	}
	if data.OriginalName != "" {
		return data.OriginalName
	}
	return "Untitled"
}
