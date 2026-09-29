package service

import (
	"testing"
	"time"
)

func TestTTLCacheExpires(t *testing.T) {
	c := NewTTLCache[int](20 * time.Millisecond)
	if _, ok := c.Get(); ok {
		t.Fatal("empty cache should miss")
	}
	c.Set(7)
	if v, ok := c.Get(); !ok || v != 7 {
		t.Fatalf("expected 7, got %v ok=%v", v, ok)
	}
	time.Sleep(30 * time.Millisecond)
	if _, ok := c.Get(); ok {
		t.Fatal("expired cache should miss")
	}
}
