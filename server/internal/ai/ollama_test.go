package ai

import (
	"context"
	"testing"
	"time"
)

func TestOllamaAvailableFailsFastWhenUnreachable(t *testing.T) {
	p := NewOllamaProvider("http://192.0.2.1:9", "llama3.1")
	start := time.Now()
	ok := p.Available(context.Background())
	elapsed := time.Since(start)
	if ok {
		t.Fatal("expected unreachable ollama to be unavailable")
	}
	if elapsed > 4*time.Second {
		t.Fatalf("Available took %s; hung health checks stall every page navigation", elapsed)
	}

	start = time.Now()
	if p.Available(context.Background()) {
		t.Fatal("cached availability should stay false")
	}
	if time.Since(start) > 100*time.Millisecond {
		t.Fatalf("cached Available took %s, want instant", time.Since(start))
	}
}

func TestOllamaCompleteFailsFastWhenUnreachable(t *testing.T) {
	p := NewOllamaProvider("http://192.0.2.1:9", "llama3.1")
	start := time.Now()
	_, err := p.Complete(context.Background(), CompletionRequest{Prompt: "hi"})
	elapsed := time.Since(start)
	if err == nil {
		t.Fatal("expected error")
	}
	if elapsed > 4*time.Second {
		t.Fatalf("Complete took %s while ollama was down", elapsed)
	}
}
