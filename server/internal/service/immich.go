package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/sandershome/server/internal/db"
)

type ImmichService struct {
	db     *db.DB
	client *http.Client
}

func NewImmichService(database *db.DB) *ImmichService {
	return &ImmichService{
		db:     database,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

type ImmichConfig struct {
	URL     string
	APIKey  string
	AlbumID string
}

func (s *ImmichService) getConfig() (*ImmichConfig, error) {
	var url, apiKey, albumID string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'immich_url'`).Scan(&url)
	if err != nil || strings.TrimSpace(url) == "" {
		return nil, fmt.Errorf("immich URL not configured")
	}
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'immich_api_key'`).Scan(&apiKey)
	s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'screensaver_album_id'`).Scan(&albumID)

	return &ImmichConfig{
		URL:     strings.Trim(strings.TrimSpace(url), `"`),
		APIKey:  strings.Trim(strings.TrimSpace(apiKey), `"`),
		AlbumID: strings.Trim(strings.TrimSpace(albumID), `"`),
	}, nil
}

type ImmichAsset struct {
	ID string `json:"id"`
}

type searchResponse struct {
	Assets struct {
		Items []struct {
			ID   string `json:"id"`
			Type string `json:"type"`
		} `json:"items"`
	} `json:"assets"`
}

func (s *ImmichService) GetAlbumPhotos(ctx context.Context) ([]ImmichAsset, error) {
	cfg, err := s.getConfig()
	if err != nil {
		return nil, err
	}
	if cfg.AlbumID == "" {
		return nil, fmt.Errorf("screensaver album not configured")
	}

	body, _ := json.Marshal(map[string]any{
		"albumIds": []string{cfg.AlbumID},
		"type":     "IMAGE",
		"size":     200,
		"page":     1,
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		cfg.URL+"/api/search/metadata", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("x-api-key", cfg.APIKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("immich unreachable: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("immich returned %d", resp.StatusCode)
	}

	var result searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode immich response: %w", err)
	}

	photos := make([]ImmichAsset, 0, len(result.Assets.Items))
	for _, item := range result.Assets.Items {
		photos = append(photos, ImmichAsset{ID: item.ID})
	}
	return photos, nil
}

type TestResult struct {
	OK        bool   `json:"ok"`
	Message   string `json:"message"`
	AlbumName string `json:"albumName,omitempty"`
	PhotoCount int   `json:"photoCount,omitempty"`
}

func (s *ImmichService) TestConnection(ctx context.Context) TestResult {
	cfg, err := s.getConfig()
	if err != nil {
		return TestResult{Message: err.Error()}
	}

	if cfg.AlbumID == "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, cfg.URL+"/api/albums", nil)
		if err != nil {
			return TestResult{Message: err.Error()}
		}
		req.Header.Set("x-api-key", cfg.APIKey)
		resp, err := s.client.Do(req)
		if err != nil {
			return TestResult{Message: fmt.Sprintf("Cannot reach Immich: %v", err)}
		}
		resp.Body.Close()
		if resp.StatusCode == 401 {
			return TestResult{Message: "Invalid API key"}
		}
		if resp.StatusCode != 200 {
			return TestResult{Message: fmt.Sprintf("Immich returned %d", resp.StatusCode)}
		}
		return TestResult{OK: true, Message: "Connected to Immich (no album configured)"}
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		cfg.URL+"/api/albums/"+cfg.AlbumID, nil)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	req.Header.Set("x-api-key", cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return TestResult{Message: fmt.Sprintf("Cannot reach Immich: %v", err)}
	}
	defer resp.Body.Close()

	if resp.StatusCode == 401 {
		return TestResult{Message: "Invalid API key"}
	}
	if resp.StatusCode == 404 {
		return TestResult{Message: "Album not found — check the album ID"}
	}
	if resp.StatusCode != 200 {
		return TestResult{Message: fmt.Sprintf("Immich returned %d", resp.StatusCode)}
	}

	var album struct {
		AlbumName  string `json:"albumName"`
		AssetCount int    `json:"assetCount"`
	}
	json.NewDecoder(resp.Body).Decode(&album)

	return TestResult{
		OK:         true,
		Message:    fmt.Sprintf("Connected — album \"%s\" with %d assets", album.AlbumName, album.AssetCount),
		AlbumName:  album.AlbumName,
		PhotoCount: album.AssetCount,
	}
}

func (s *ImmichService) ProxyAsset(ctx context.Context, assetID string) (io.ReadCloser, string, error) {
	cfg, err := s.getConfig()
	if err != nil {
		return nil, "", err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		cfg.URL+"/api/assets/"+assetID+"/thumbnail?size=preview", nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("x-api-key", cfg.APIKey)

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, "", fmt.Errorf("immich unreachable: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return nil, "", fmt.Errorf("immich returned %d", resp.StatusCode)
	}

	return resp.Body, resp.Header.Get("Content-Type"), nil
}
