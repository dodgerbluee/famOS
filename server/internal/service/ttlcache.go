package service

import (
	"sync"
	"time"
)

// TTLCache is a single-slot in-memory cache. Used so Gatus/Seerr (and similar
// household HTTP integrations) are not stampeded by duplicate Home widgets or
// multiple kiosks refreshing at once.
type TTLCache[T any] struct {
	mu  sync.Mutex
	val T
	ok  bool
	at  time.Time
	ttl time.Duration
}

func NewTTLCache[T any](ttl time.Duration) *TTLCache[T] {
	return &TTLCache[T]{ttl: ttl}
}

func (c *TTLCache[T]) Get() (T, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	var zero T
	if !c.ok || time.Since(c.at) >= c.ttl {
		return zero, false
	}
	return c.val, true
}

func (c *TTLCache[T]) Set(val T) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.val = val
	c.ok = true
	c.at = time.Now()
}
