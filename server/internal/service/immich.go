package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/sandershome/server/internal/db"
)

type ImmichService struct {
	db     *db.DB
	client *http.Client

	albumMu       sync.Mutex
	albumCache    []ImmichAsset
	albumCachedAt time.Time
}

func NewImmichService(database *db.DB) *ImmichService {
	return &ImmichService{
		db:     database,
		client: &http.Client{Timeout: 30 * time.Second},
	}
}

// ImmichSource is one configured Immich connection: a URL, an API key, and the
// album to pull from. Multiple sources (same account or different accounts) can
// be combined into the screensaver.
type ImmichSource struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	URL     string `json:"url"`
	APIKey  string `json:"apiKey"`
	AlbumID string `json:"albumId"`
	Enabled bool   `json:"enabled"`
}

type ImmichAsset struct {
	ID       string `json:"id"`
	CreatedAt string `json:"createdAt"`
	SourceID string `json:"sourceId"`
}

func cleanSetting(s string) string {
	return strings.Trim(strings.TrimSpace(s), `"`)
}

// getSources returns the enabled sources used to build the screensaver feed.
func (s *ImmichService) getSources() ([]ImmichSource, error) {
	rows, err := s.db.Query(`SELECT id, name, url, api_key, album_id, enabled FROM immich_sources WHERE enabled = 1 ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := []ImmichSource{}
	for rows.Next() {
		var src ImmichSource
		var enabled int
		if err := rows.Scan(&src.ID, &src.Name, &src.URL, &src.APIKey, &src.AlbumID, &enabled); err != nil {
			continue
		}
		src.Enabled = enabled == 1
		src.URL = cleanSetting(src.URL)
		src.APIKey = cleanSetting(src.APIKey)
		src.AlbumID = cleanSetting(src.AlbumID)
		sources = append(sources, src)
	}
	return sources, nil
}

// GetSourceByID returns a single source (enabled or not) for proxying assets.
func (s *ImmichService) GetSourceByID(id string) (*ImmichSource, error) {
	var src ImmichSource
	var enabled int
	err := s.db.QueryRow(`SELECT id, name, url, api_key, album_id, enabled FROM immich_sources WHERE id = ?`, id).
		Scan(&src.ID, &src.Name, &src.URL, &src.APIKey, &src.AlbumID, &enabled)
	if err != nil {
		return nil, fmt.Errorf("immich source not found")
	}
	src.Enabled = enabled == 1
	src.URL = cleanSetting(src.URL)
	src.APIKey = cleanSetting(src.APIKey)
	src.AlbumID = cleanSetting(src.AlbumID)
	return &src, nil
}

// ListSources returns every source (enabled or disabled) with real values,
// for the settings UI. The handler masks API keys before sending to clients.
func (s *ImmichService) ListSources() ([]ImmichSource, error) {
	rows, err := s.db.Query(`SELECT id, name, url, api_key, album_id, enabled FROM immich_sources ORDER BY created_at`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	sources := []ImmichSource{}
	for rows.Next() {
		var src ImmichSource
		var enabled int
		if err := rows.Scan(&src.ID, &src.Name, &src.URL, &src.APIKey, &src.AlbumID, &enabled); err != nil {
			continue
		}
		src.Enabled = enabled == 1
		sources = append(sources, src)
	}
	return sources, nil
}

func (s *ImmichService) CreateSource(id, name, url, apiKey, albumID string, enabled bool) (*ImmichSource, error) {
	en := 0
	if enabled {
		en = 1
	}
	_, err := s.db.Exec(
		`INSERT INTO immich_sources (id, name, url, api_key, album_id, enabled) VALUES (?, ?, ?, ?, ?, ?)`,
		id, name, cleanSetting(url), cleanSetting(apiKey), cleanSetting(albumID), en,
	)
	if err != nil {
		return nil, err
	}
	return s.GetSourceByID(id)
}

// UpdateSource applies only the fields the client provided. Empty strings for
// url/name/albumId mean "leave unchanged" (the masked API key is handled by the
// handler, which passes an empty apiKey to mean "keep existing").
func (s *ImmichService) UpdateSource(id, name, url, apiKey, albumID string, setEnabled, enabled bool) (*ImmichSource, error) {
	if name != "" {
		s.db.Exec(`UPDATE immich_sources SET name = ? WHERE id = ?`, name, id)
	}
	if strings.TrimSpace(url) != "" {
		s.db.Exec(`UPDATE immich_sources SET url = ? WHERE id = ?`, cleanSetting(url), id)
	}
	if apiKey != "" {
		s.db.Exec(`UPDATE immich_sources SET api_key = ? WHERE id = ?`, cleanSetting(apiKey), id)
	}
	if albumID != "" {
		s.db.Exec(`UPDATE immich_sources SET album_id = ? WHERE id = ?`, cleanSetting(albumID), id)
	}
	if setEnabled {
		en := 0
		if enabled {
			en = 1
		}
		s.db.Exec(`UPDATE immich_sources SET enabled = ? WHERE id = ?`, en, id)
	}
	return s.GetSourceByID(id)
}

func (s *ImmichService) DeleteSource(id string) error {
	_, err := s.db.Exec(`DELETE FROM immich_sources WHERE id = ?`, id)
	return err
}


// InvalidateCache clears the cached album photo list so the next request
// re-fetches from all sources. Call after sources are added/edited/removed.
func (s *ImmichService) InvalidateCache() {
	s.albumMu.Lock()
	s.albumCache = nil
	s.albumCachedAt = time.Time{}
	s.albumMu.Unlock()
}

type searchResponse struct {
	Assets struct {
		Items []struct {
			ID          string `json:"id"`
			Type        string `json:"type"`
			FileCreated string `json:"fileCreatedAt"`
			LocalDate   string `json:"localDateTime"`
		} `json:"items"`
	} `json:"assets"`
}

// GetAlbumPhotos aggregates photos from every enabled source. Assets are
// tagged with their source ID so the proxy endpoint can fetch them with the
// right credentials. Individual source failures are tolerated so one broken
// account does not blank the whole feed.
func (s *ImmichService) GetAlbumPhotos(ctx context.Context) ([]ImmichAsset, error) {
	s.albumMu.Lock()
	if s.albumCache != nil && time.Since(s.albumCachedAt) < time.Hour {
		photos := s.albumCache
		s.albumMu.Unlock()
		return photos, nil
	}
	s.albumMu.Unlock()

	sources, err := s.getSources()
	if err != nil {
		return nil, err
	}
	if len(sources) == 0 {
		return nil, fmt.Errorf("no immich albums configured")
	}

	photos := make([]ImmichAsset, 0, 512)
	seen := make(map[string]struct{}, 512)
	var failures int

	for _, src := range sources {
		if src.URL == "" || src.AlbumID == "" {
			failures++
			continue
		}
		items, err := s.fetchAlbum(ctx, src)
		if err != nil {
			failures++
			continue
		}
		for _, item := range items {
			key := src.ID + ":" + item.ID
			if _, ok := seen[key]; ok {
				continue
			}
			seen[key] = struct{}{}
			photos = append(photos, ImmichAsset{ID: item.ID, CreatedAt: item.CreatedAt, SourceID: src.ID})
		}
	}

	// Only error out when every source failed, so partial failures still show.
	if len(photos) == 0 && failures == len(sources) {
		return nil, fmt.Errorf("could not reach any configured Immich album")
	}

	s.albumMu.Lock()
	s.albumCache = photos
	s.albumCachedAt = time.Now()
	s.albumMu.Unlock()

	return photos, nil
}

type assetItem struct {
	ID        string
	CreatedAt string
}

func (s *ImmichService) fetchAlbum(ctx context.Context, src ImmichSource) ([]assetItem, error) {
	const pageSize = 500
	const maxPages = 20

	items := make([]assetItem, 0, pageSize)
	for page := 1; page <= maxPages; page++ {
		body, _ := json.Marshal(map[string]any{
			"albumIds": []string{src.AlbumID},
			"type":     "IMAGE",
			"size":     pageSize,
			"page":     page,
		})

		req, err := http.NewRequestWithContext(ctx, http.MethodPost,
			src.URL+"/api/search/metadata", bytes.NewReader(body))
		if err != nil {
			return nil, err
		}
		req.Header.Set("x-api-key", src.APIKey)
		req.Header.Set("Content-Type", "application/json")

		resp, err := s.client.Do(req)
		if err != nil {
			return nil, fmt.Errorf("immich unreachable: %w", err)
		}
		if resp.StatusCode != http.StatusOK {
			resp.Body.Close()
			return nil, fmt.Errorf("immich returned %d", resp.StatusCode)
		}

		var result searchResponse
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			resp.Body.Close()
			return nil, fmt.Errorf("decode immich response: %w", err)
		}
		resp.Body.Close()

		for _, it := range result.Assets.Items {
			createdAt := it.FileCreated
			if createdAt == "" {
				createdAt = it.LocalDate
			}
			items = append(items, assetItem{ID: it.ID, CreatedAt: createdAt})
		}

		if len(result.Assets.Items) < pageSize {
			break
		}
	}
	return items, nil
}

type TestResult struct {
	OK         bool   `json:"ok"`
	Message    string `json:"message"`
	AlbumName  string `json:"albumName,omitempty"`
	PhotoCount int    `json:"photoCount,omitempty"`
}

// TestSource verifies a saved source by ID.
func (s *ImmichService) TestSource(ctx context.Context, id string) TestResult {
	src, err := s.GetSourceByID(id)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	return s.testConfig(ctx, *src)
}

// TestConfig verifies an unsaved source (used by the "add" form before saving).
func (s *ImmichService) TestConfig(ctx context.Context, url, apiKey, albumID string) TestResult {
	return s.testConfig(ctx, ImmichSource{
		URL:     cleanSetting(url),
		APIKey:  cleanSetting(apiKey),
		AlbumID: cleanSetting(albumID),
	})
}

func (s *ImmichService) testConfig(ctx context.Context, src ImmichSource) TestResult {
	if src.URL == "" {
		return TestResult{Message: "Immich URL is required"}
	}

	if src.AlbumID == "" {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, src.URL+"/api/albums", nil)
		if err != nil {
			return TestResult{Message: err.Error()}
		}
		req.Header.Set("x-api-key", src.APIKey)
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
		src.URL+"/api/albums/"+src.AlbumID, nil)
	if err != nil {
		return TestResult{Message: err.Error()}
	}
	req.Header.Set("x-api-key", src.APIKey)

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

func (s *ImmichService) ProxyAsset(ctx context.Context, sourceID, assetID, size string) (io.ReadCloser, string, error) {
	src, err := s.GetSourceByID(sourceID)
	if err != nil {
		return nil, "", err
	}
	if src.URL == "" {
		return nil, "", fmt.Errorf("immich URL not configured")
	}

	switch size {
	case "thumbnail", "preview":
	default:
		size = "preview"
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet,
		src.URL+"/api/assets/"+assetID+"/thumbnail?size="+size, nil)
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("x-api-key", src.APIKey)

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
