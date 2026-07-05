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
}
