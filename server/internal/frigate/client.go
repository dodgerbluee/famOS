package frigate

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/cookiejar"
	"sync"
	"time"
)

type Client struct {
	mu         sync.RWMutex
	baseURL    string
	username   string
	password   string
	httpClient *http.Client
}

func NewClient(baseURL string) *Client {
	jar, _ := cookiejar.New(nil)
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 15 * time.Second,
			Jar:     jar,
		},
	}
}

func (c *Client) Configure(baseURL, username, password string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if baseURL != "" {
		c.baseURL = baseURL
	}
	c.username = username
	c.password = password
	jar, _ := cookiejar.New(nil)
	c.httpClient.Jar = jar
}

func (c *Client) config() (string, string, string) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.baseURL, c.username, c.password
}

func (c *Client) BaseURL() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.baseURL
}

func (c *Client) CookieJar() http.CookieJar {
	return c.httpClient.Jar
}

func (c *Client) Login(ctx context.Context) error {
	return c.login(ctx)
}

func (c *Client) ProxyGet(ctx context.Context, url string) (*http.Response, error) {
	return c.doRequest(ctx, http.MethodGet, url)
}

func (c *Client) login(ctx context.Context) error {
	base, user, pass := c.config()
	if user == "" || pass == "" {
		return nil
	}
	body, _ := json.Marshal(map[string]string{"user": user, "password": pass})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/api/login", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("login request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-CSRF-TOKEN", "1")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("login failed: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("login returned %d: %s", resp.StatusCode, string(body))
	}
	return nil
}

func (c *Client) newRequest(ctx context.Context, method, url string) (*http.Request, error) {
	req, err := http.NewRequestWithContext(ctx, method, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-CSRF-TOKEN", "1")
	return req, nil
}

func (c *Client) doRequest(ctx context.Context, method, url string) (*http.Response, error) {
	req, err := c.newRequest(ctx, method, url)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode == http.StatusUnauthorized {
		resp.Body.Close()
		if err := c.login(ctx); err != nil {
			return nil, err
		}
		req, err = c.newRequest(ctx, method, url)
		if err != nil {
			return nil, err
		}
		return c.httpClient.Do(req)
	}
	return resp, nil
}

type FrigateConfig struct {
	Cameras map[string]json.RawMessage `json:"cameras"`
}

type Camera struct {
	Name        string `json:"name"`
	SnapshotURL string `json:"snapshotUrl"`
	StreamURL   string `json:"streamUrl"`
}

type Event struct {
	ID           string  `json:"id"`
	Camera       string  `json:"camera"`
	Label        string  `json:"label"`
	TopScore     float64 `json:"top_score"`
	StartTime    float64 `json:"start_time"`
	EndTime      float64 `json:"end_time"`
	HasSnapshot  bool    `json:"has_snapshot"`
	HasClip      bool    `json:"has_clip"`
	ThumbnailURL string  `json:"thumbnailUrl"`
}

func (c *Client) Available(ctx context.Context) bool {
	base, _, _ := c.config()
	if base == "" {
		return false
	}
	resp, err := c.doRequest(ctx, http.MethodGet, base+"/api/version")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

func (c *Client) ListCameras(ctx context.Context) ([]Camera, error) {
	base, _, _ := c.config()
	resp, err := c.doRequest(ctx, http.MethodGet, base+"/api/config")
	if err != nil {
		return nil, fmt.Errorf("frigate config request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusUnauthorized {
		return nil, fmt.Errorf("authentication failed — check Frigate credentials in Settings")
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("frigate returned %d", resp.StatusCode)
	}

	var config FrigateConfig
	if err := json.NewDecoder(resp.Body).Decode(&config); err != nil {
		return nil, fmt.Errorf("decode config: %w", err)
	}

	var cameras []Camera
	for name := range config.Cameras {
		cameras = append(cameras, Camera{
			Name:        name,
			SnapshotURL: fmt.Sprintf("/api/cameras/%s/snapshot", name),
			StreamURL:   fmt.Sprintf("/api/cameras/%s/stream", name),
		})
	}

	return cameras, nil
}

func (c *Client) GetSnapshot(ctx context.Context, cameraName string) ([]byte, string, error) {
	base, _, _ := c.config()
	url := fmt.Sprintf("%s/api/%s/latest.jpg?h=720", base, cameraName)
	resp, err := c.doRequest(ctx, http.MethodGet, url)
	if err != nil {
		return nil, "", fmt.Errorf("snapshot request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, "", fmt.Errorf("snapshot returned %d", resp.StatusCode)
	}

	data, err := io.ReadAll(resp.Body)
	return data, resp.Header.Get("Content-Type"), err
}

func (c *Client) GetEventThumbnail(ctx context.Context, eventID string) ([]byte, string, error) {
	base, _, _ := c.config()
	url := fmt.Sprintf("%s/api/events/%s/thumbnail.jpg", base, eventID)
	resp, err := c.doRequest(ctx, http.MethodGet, url)
	if err != nil {
		return nil, "", fmt.Errorf("thumbnail request failed: %w", err)
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	return data, resp.Header.Get("Content-Type"), err
}

func (c *Client) ListEvents(ctx context.Context, limit int) ([]Event, error) {
	if limit <= 0 {
		limit = 20
	}
	base, _, _ := c.config()
	url := fmt.Sprintf("%s/api/events?limit=%d&has_snapshot=1", base, limit)
	resp, err := c.doRequest(ctx, http.MethodGet, url)
	if err != nil {
		return nil, fmt.Errorf("events request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("events returned %d", resp.StatusCode)
	}

	var events []Event
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, fmt.Errorf("decode events: %w", err)
	}

	for i := range events {
		events[i].ThumbnailURL = fmt.Sprintf("/api/cameras/events/%s/thumbnail", events[i].ID)
	}

	return events, nil
}
