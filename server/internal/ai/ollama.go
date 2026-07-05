package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"
)

type OllamaProvider struct {
	baseURL   string
	apiPrefix string
	model     string
	apiKey    string
	client    *http.Client
}

func NewOllamaProvider(baseURL, model string) *OllamaProvider {
	return &OllamaProvider{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func NewOllamaProviderWithKey(baseURL, model, apiKey string) *OllamaProvider {
	return &OllamaProvider{
		baseURL: strings.TrimRight(baseURL, "/"),
		model:   model,
		apiKey:  apiKey,
		client:  &http.Client{Timeout: 120 * time.Second},
	}
}

func (p *OllamaProvider) Name() string {
	return "ollama"
}

func (p *OllamaProvider) setAuth(req *http.Request) {
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
}

func (p *OllamaProvider) tryRequest(ctx context.Context, method, path string) (*http.Response, error) {
	req, err := http.NewRequestWithContext(ctx, method, p.baseURL+path, nil)
	if err != nil {
		return nil, err
	}
	p.setAuth(req)
	return p.client.Do(req)
}

// detectPrefix tries Ollama API at multiple paths and returns the working prefix.
// Direct Ollama: /api/tags
// Open WebUI proxy: /ollama/api/tags
func (p *OllamaProvider) detectPrefix(ctx context.Context) (string, error) {
	if p.apiPrefix != "" {
		return p.apiPrefix, nil
	}

	prefixes := []string{"/api", "/ollama/api"}
	var lastErr string
	for _, prefix := range prefixes {
		resp, err := p.tryRequest(ctx, http.MethodGet, prefix+"/tags")
		if err != nil {
			lastErr = err.Error()
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			lastErr = fmt.Sprintf("%s returned %d — check your API key", p.baseURL+prefix+"/tags", resp.StatusCode)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Sprintf("%s returned %d", p.baseURL+prefix+"/tags", resp.StatusCode)
			continue
		}

		// Verify it's actually JSON, not an HTML login page
		trimmed := strings.TrimSpace(string(body))
		if len(trimmed) == 0 || trimmed[0] != '{' {
			lastErr = fmt.Sprintf("%s returned HTML instead of JSON — this may be a login page; check your API key", p.baseURL+prefix+"/tags")
			continue
		}

		p.apiPrefix = prefix
		return prefix, nil
	}
	return "", fmt.Errorf("%s", lastErr)
}

func (p *OllamaProvider) Available(ctx context.Context) bool {
	_, err := p.detectPrefix(ctx)
	return err == nil
}

type OllamaModel struct {
	Name string `json:"name"`
}

type ollamaTagsResponse struct {
	Models []OllamaModel `json:"models"`
}

func (p *OllamaProvider) ListModels(ctx context.Context) ([]string, error) {
	prefix, err := p.detectPrefix(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+prefix+"/tags", nil)
	if err != nil {
		return nil, err
	}
	p.setAuth(req)
	resp, err := p.client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach server: %w", err)
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return nil, fmt.Errorf("authentication failed (%d) — check your API key", resp.StatusCode)
	}
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("server returned %d", resp.StatusCode)
	}

	var tags ollamaTagsResponse
	if err := json.Unmarshal(body, &tags); err != nil {
		return nil, fmt.Errorf("unexpected response — server may require an API key")
	}
	names := make([]string, len(tags.Models))
	for i, m := range tags.Models {
		names[i] = m.Name
	}
	return names, nil
}

type ollamaRequest struct {
	Model    string          `json:"model"`
	Messages []ollamaMessage `json:"messages"`
	Stream   bool            `json:"stream"`
	Format   string          `json:"format,omitempty"`
	Think    *bool           `json:"think,omitempty"`
	Options  ollamaOptions   `json:"options,omitempty"`
}

type ollamaMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type ollamaOptions struct {
	Temperature float64 `json:"temperature,omitempty"`
	NumPredict  int     `json:"num_predict,omitempty"`
}

type ollamaResponse struct {
	Message    ollamaMessage `json:"message"`
	Response   string        `json:"response"`
	Thinking   string        `json:"thinking"`
	DoneReason string        `json:"done_reason"`
	Choices    []struct {
		Message ollamaMessage `json:"message"`
	} `json:"choices"`
}

func (p *OllamaProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	prefix, err := p.detectPrefix(ctx)
	if err != nil {
		return nil, err
	}

	messages := []ollamaMessage{}
	if req.System != "" {
		messages = append(messages, ollamaMessage{Role: "system", Content: req.System})
	}
	messages = append(messages, ollamaMessage{Role: "user", Content: req.Prompt})
	think := false

	ollamaReq := ollamaRequest{
		Model:    p.model,
		Messages: messages,
		Stream:   false,
		Format:   "json",
		Think:    &think,
		Options: ollamaOptions{
			Temperature: req.Temperature,
			NumPredict:  req.MaxTokens,
		},
	}

	body, err := json.Marshal(ollamaReq)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+prefix+"/chat", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	p.setAuth(httpReq)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("server returned %d: %s", resp.StatusCode, string(respBody))
	}

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}
	log.Printf("ollama.raw_response body=%q", string(respBody))

	var ollamaResp ollamaResponse
	if err := json.Unmarshal(respBody, &ollamaResp); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	text := ollamaResp.Message.Content
	if text == "" {
		text = ollamaResp.Response
	}
	if text == "" && len(ollamaResp.Choices) > 0 {
		text = ollamaResp.Choices[0].Message.Content
	}
	if strings.TrimSpace(text) == "" {
		return nil, fmt.Errorf("ollama returned empty content (done_reason=%s thinking_len=%d)", ollamaResp.DoneReason, len(ollamaResp.Thinking))
	}

	return &CompletionResponse{Text: text}, nil
}
