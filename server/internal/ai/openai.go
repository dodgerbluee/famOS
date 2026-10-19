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

// candidatePrefixes orders the API-mount guesses. If the configured URL
// already ends in /v1 the API is mounted there directly.
func (p *OpenAIProvider) candidatePrefixes() []string {
	if strings.HasSuffix(p.baseURL, "/v1") {
		return []string{"", "/v1"}
	}
	return []string{"/v1", ""}
}

// detectPrefix finds where the server exposes its API. Most OpenAI-compatible
// servers live under /v1; some gateways mount the API at the root, and some
// only implement /chat/completions while serving their web UI (HTML) for
// every other path — so an unusable /models response is not conclusive and
// we fall back to a zero-cost POST probe of chat/completions.
func (p *OpenAIProvider) detectPrefix(ctx context.Context) (string, error) {
	if p.apiPrefix != "" {
		return p.apiPrefix, nil
	}

	var lastErr string
	for _, prefix := range p.candidatePrefixes() {
		ok, err := p.probePrefix(ctx, prefix)
		if ok {
			p.apiPrefix = prefix
			return prefix, nil
		}
		lastErr = err
	}
	return "", fmt.Errorf("%s", lastErr)
}

// probePrefix reports whether an OpenAI-compatible API is mounted at prefix.
func (p *OpenAIProvider) probePrefix(ctx context.Context, prefix string) (bool, string) {
	healthCtx, cancel := context.WithTimeout(ctx, openaiHealthTimeout)
	defer cancel()

	modelsNote := "unreachable"
	modelsURL := p.baseURL + prefix + "/models"
	req, err := http.NewRequestWithContext(healthCtx, http.MethodGet, modelsURL, nil)
	if err != nil {
		return false, err.Error()
	}
	p.setAuth(req)
	if resp, err := p.healthClient.Do(req); err == nil {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		if resp.StatusCode == http.StatusOK && isJSONBody(body) {
			return true, ""
		}
		modelsNote = fmt.Sprintf("HTTP %d (%s)", resp.StatusCode, firstWord(body))
	}

	// /models is unusable (404, HTML login page, SPA fallback...). A real
	// OpenAI-compatible endpoint answers POST /chat/completions with JSON —
	// usually a 400 about the empty body; a web UI answers with HTML.
	chatURL := p.baseURL + prefix + "/chat/completions"
	chatReq, err := http.NewRequestWithContext(healthCtx, http.MethodPost, chatURL, strings.NewReader("{}"))
	if err != nil {
		return false, err.Error()
	}
	chatReq.Header.Set("Content-Type", "application/json")
	p.setAuth(chatReq)
	chatResp, err := p.healthClient.Do(chatReq)
	if err != nil {
		return false, fmt.Sprintf("%s is not reachable: %v", chatURL, err)
	}
	chatBody, _ := io.ReadAll(chatResp.Body)
	chatResp.Body.Close()

	if isJSONBody(chatBody) {
		switch chatResp.StatusCode {
		case http.StatusUnauthorized, http.StatusForbidden:
			return false, fmt.Sprintf("%s/chat/completions rejected the API key (HTTP %d)", p.baseURL+prefix, chatResp.StatusCode)
		case http.StatusNotFound, http.StatusMethodNotAllowed:
			return false, fmt.Sprintf("%s/chat/completions does not exist at this mount (HTTP %d)", p.baseURL+prefix, chatResp.StatusCode)
		}
		return true, ""
	}
	return false, fmt.Sprintf("%s does not look like an API endpoint: /models returned %s and /chat/completions returned HTTP %d of non-JSON (%s) — the URL may point at the server's web UI instead of its API",
		p.baseURL+prefix, modelsNote, chatResp.StatusCode, firstWord(chatBody))
}

func firstWord(b []byte) string {
	s := strings.TrimSpace(string(b))
	if i := strings.IndexAny(s, " \n<{"); i > 0 {
		s = s[:i]
	}
	if len(s) > 40 {
		s = s[:40]
	}
	return s
}

func isJSONBody(b []byte) bool {
	s := strings.TrimSpace(string(b))
	return len(s) > 0 && (s[0] == '{' || s[0] == '[')
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
	if !isJSONBody(body) {
		return nil, fmt.Errorf("this server does not expose a model list — enter the model name manually")
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
			Content   string `json:"content"`
			Reasoning string `json:"reasoning"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func (p *OpenAIProvider) postChat(ctx context.Context, prefix string, payload []byte) ([]byte, int, error) {
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+prefix+"/chat/completions", bytes.NewReader(payload))
	if err != nil {
		return nil, 0, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	p.setAuth(httpReq)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	return body, resp.StatusCode, nil
}

func (p *OpenAIProvider) Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	prefix, err := p.detectPrefix(ctx)
	if err != nil {
		return nil, fmt.Errorf("openai endpoint unreachable: %w", err)
	}

	payload, err := json.Marshal(openaiChatRequest{
		Model:            p.model,
		Messages:         openaiMessages(req),
		MaxTokens:        req.MaxTokens,
		Temperature:      req.Temperature,
		FrequencyPenalty: 0.3,
	})
	if err != nil {
		return nil, err
	}

	respBody, status, err := p.postChat(ctx, prefix, payload)
	if err != nil {
		return nil, fmt.Errorf("chat completion request failed: %w", err)
	}

	// If the mount guess produced a 404 or an HTML page (SPA fallback), flip
	// the prefix once and retry before giving up.
	if status == http.StatusNotFound || !isJSONBody(respBody) {
		alt := "/v1"
		if prefix == "/v1" {
			alt = ""
		}
		if altBody, altStatus, altErr := p.postChat(ctx, alt, payload); altErr == nil && altStatus == http.StatusOK && isJSONBody(altBody) {
			p.apiPrefix = alt
			respBody, status = altBody, altStatus
		}
	}

	if status != http.StatusOK {
		return nil, fmt.Errorf("chat completion returned %d: %s", status, snippet(respBody))
	}

	var parsed openaiChatResponse
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return nil, fmt.Errorf("failed to parse completion response: %w", err)
	}
	if parsed.Error != nil {
		return nil, fmt.Errorf("api error: %s", parsed.Error.Message)
	}
	if len(parsed.Choices) == 0 {
		return nil, fmt.Errorf("empty completion: %s", snippet(respBody))
	}
	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	if content == "" {
		// Reasoning models can burn the whole token budget on thinking and
		// return no visible content; surface the cause instead of "" so the
		// engine logs something actionable.
		if parsed.Choices[0].Message.Reasoning != "" {
			return nil, fmt.Errorf("model returned only reasoning (finish_reason=%s); raise max_tokens or use a non-reasoning model", parsed.Choices[0].FinishReason)
		}
		return nil, fmt.Errorf("empty completion content (finish_reason=%s): %s", parsed.Choices[0].FinishReason, snippet(respBody))
	}
	return &CompletionResponse{Text: content}, nil
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
