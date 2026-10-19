package ai

import "context"

type CompletionRequest struct {
	System      string  `json:"system"`
	Prompt      string  `json:"prompt"`
	MaxTokens   int     `json:"maxTokens"`
	Temperature float64 `json:"temperature"`
}

type CompletionResponse struct {
	Text string `json:"text"`
}

type Provider interface {
	Complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error)
	Available(ctx context.Context) bool
	Name() string
	ListModels(ctx context.Context) ([]string, error)
}

// NewProvider builds a Provider for the given kind. Unknown kinds fall back
// to Ollama so rows written before the kind column existed keep working.
func NewProvider(kind, url, model, apiKey string) Provider {
	switch kind {
	case "openai":
		return NewOpenAIProvider(url, model, apiKey)
	default:
		return NewOllamaProviderWithKey(url, model, apiKey)
	}
}
