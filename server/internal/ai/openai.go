package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	openaiGenerateTimeout = 120 * time.Second
	openaiHealthTimeout   = 3 * time.Second
	openaiAvailCacheFor   = 30 * time.Second
)

// OpenAIProvider talks to any OpenAI-compatible chat completions API
// (OpenAI itself, gateways like Strata, llama.cpp, vLLM, LM Studio, ...).
type OpenAIProvider struct {
	baseURL      string
	apiPrefix    string // detected: "/v1" or ""
	model        string
	apiKey       string
	client       *http.Client
	healthClient *http.Client

	availMu  sync.Mutex
	availOK  bool
	availAt  time.Time
	availErr error
}

func NewOpenAIProvider(baseURL, model, apiKey string) *OpenAIProvider {
	dialer := &net.Dialer{Timeout: ollamaDialTimeout}
	transport := &http.Transport{
		DialContext:           dialer.DialContext,
		ResponseHeaderTimeout: openaiHealthTimeout,
	}
	return &OpenAIProvider{
		baseURL:      strings.TrimRight(baseURL, "/"),
		model:        model,
		apiKey:       apiKey,
		client:       &http.Client{Timeout: openaiGenerateTimeout},
		healthClient: &http.Client{Timeout: openaiHealthTimeout, Transport: transport},
	}
}

func (p *OpenAIProvider) Name() string {
	return "openai"
}

func (p *OpenAIProvider) setAuth(req *http.Request) {
	if p.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+p.apiKey)
	}
}

// detectPrefix finds where the server exposes its API. Most OpenAI-compatible
// servers live under /v1; some gateways mount the API at the root.
func (p *OpenAIProvider) detectPrefix(ctx context.Context) (string, error) {
	if p.apiPrefix != "" {
		return p.apiPrefix, nil
	}

	prefixes := []string{"/v1", ""}
	var lastErr string
	for _, prefix := range prefixes {
		healthCtx, cancel := context.WithTimeout(ctx, openaiHealthTimeout)
		req, err := http.NewRequestWithContext(healthCtx, http.MethodGet, p.baseURL+prefix+"/models", nil)
		if err != nil {
			cancel()
			return "", err
		}
		p.setAuth(req)
		resp, err := p.healthClient.Do(req)
		cancel()
		if err != nil {
			lastErr = err.Error()
			continue
		}
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
			lastErr = fmt.Sprintf("%s returned %d — check your API key", p.baseURL+prefix+"/models", resp.StatusCode)
			continue
		}
		if resp.StatusCode != http.StatusOK {
			lastErr = fmt.Sprintf("%s returned %d", p.baseURL+prefix+"/models", resp.StatusCode)
			continue
		}

		trimmed := strings.TrimSpace(string(body))
		if len(trimmed) == 0 || (trimmed[0] != '{' && trimmed[0] != '[') {
			lastErr = fmt.Sprintf("%s returned HTML instead of JSON — this may be a login page; check your API key", p.baseURL+prefix+"/models")
			continue
		}

		p.apiPrefix = prefix
		return prefix, nil
	}
	return "", fmt.Errorf("%s", lastErr)
}

func (p *OpenAIProvider) Available(ctx context.Context) bool {
	p.availMu.Lock()
	if !p.availAt.IsZero() && time.Since(p.availAt) < openaiAvailCacheFor {
		ok := p.availOK
		p.availMu.Unlock()
		return ok
	}
	p.availMu.Unlock()

	_, err := p.detectPrefix(ctx)
	p.availMu.Lock()
	p.availAt = time.Now()
	p.availOK = err == nil
	p.availErr = err
	p.availMu.Unlock()
	return err == nil
}

type openaiModel struct {
	ID string `json:"id"`
}

type openaiModelsResponse struct {
	Data []openaiModel `json:"data"`
}

func (p *OpenAIProvider) ListModels(ctx context.Context) ([]string, error) {
	prefix, err := p.detectPrefix(ctx)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, p.baseURL+prefix+"/models", nil)
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

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("models endpoint returned %d: %s", resp.StatusCode, snippet(body))
	}

	var parsed openaiModelsResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse models response: %w", err)
	}

	models := make([]string, 0, len(parsed.Data))
	for _, m := range parsed.Data {
		if m.ID != "" {
			models = append(models, m.ID)
		}
	}
	return models, nil
}

type openaiChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type openaiChatRequest struct {
	Model            string              `json:"model"`
	Messages         []openaiChatMessage `json:"messages"`
	MaxTokens        int                 `json:"max_tokens,omitempty"`
	Temperature      float64             `json:"temperature,omitempty"`
	FrequencyPenalty float64             `json:"frequency_penalty,omitempty"`
}

type openaiChatResponse struct {
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p *OpenAIProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	prefix, err := p.detectPrefix(ctx)
	if err != nil {
		return nil, fmt.Errorf("openai endpoint unreachable: %w", err)
	}

	body, err := json.Marshal(openaiChatRequest{
		Model:            p.model,
		Messages:         openaiMessages(req),
		MaxTokens:        req.MaxTokens,
		Temperature:      req.Temperature,
		FrequencyPenalty: 0.3,
	})
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+prefix+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	p.setAuth(httpReq)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("chat completion request failed: %w", err)
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("chat completion returned %d: %s", resp.StatusCode, snippet(respBody))
	}

	var parsed openaiChatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse completion response: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("api error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("empty completion")
	}
	return &CompletionResponse{Text: parsed.Choices[0].Message.Content}, nil
}

func openaiMessages(req CompletionRequest) []openaiChatMessage {
	msgs := make([]openaiChatMessage, 0, 2)
	if req.System != "" {
		msgs = append(msgs, openaiChatMessage{Role: "system", Content: req.System})
	}
	msgs = append(msgs, openaiChatMessage{Role: "user", Content: req.Prompt})
	return msgs
}

func snippet(b []byte) string {
	s := strings.TrimSpace(string(b))
	if len(s) > 200 {
		s = s[:200] + "..."
	}
	return s
}
