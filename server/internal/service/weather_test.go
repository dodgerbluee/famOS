package service

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/sandershome/server/internal/db"
)

func setupWeatherDB(t *testing.T) *db.DB {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	return database
}

func fakeOpenMeteo(t *testing.T, forecastCalls *atomic.Int64, delay time.Duration) *httptest.Server {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/forecast", func(w http.ResponseWriter, r *http.Request) {
		if forecastCalls != nil {
			forecastCalls.Add(1)
		}
		if delay > 0 {
			time.Sleep(delay)
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"current_weather": map[string]any{"temperature": 72.5, "windspeed": 5.0, "winddirection": 180, "weathercode": 0},
			"hourly": map[string]any{
				"time":           []string{"2099-01-01T00:00", "2099-01-01T01:00"},
				"temperature_2m": []float64{70, 69},
				"weathercode":    []int{0, 1},
			},
			"daily": map[string]any{
				"time":               []string{"2099-01-01"},
				"temperature_2m_max": []float64{80},
				"temperature_2m_min": []float64{60},
				"sunrise":            []string{"2099-01-01T07:10"},
				"sunset":             []string{"2099-01-01T18:20"},
			},
		})
	})
	mux.HandleFunc("/v1/air-quality", func(w http.ResponseWriter, r *http.Request) {
		json.NewEncoder(w).Encode(map[string]any{"current": map[string]any{"us_aqi": 30}})
	})
	return httptest.NewServer(mux)
}

func newTestWeatherService(t *testing.T, database *db.DB, baseURL string) *WeatherService {
	t.Helper()
	svc := NewWeatherService(database, 33.0, -96.0, "UTC")
	svc.baseURL = baseURL
	svc.airBaseURL = baseURL
	return svc
}

// Page loads must never each trigger an upstream call: repeated GetWeather
// within the fresh window is served from the shared cache.
func TestGetWeatherServesCacheWithinTTL(t *testing.T) {
	database := setupWeatherDB(t)
	var calls atomic.Int64
	srv := fakeOpenMeteo(t, &calls, 0)
	defer srv.Close()

	svc := newTestWeatherService(t, database, srv.URL)
	ctx := context.Background()

	first, err := svc.GetWeather(ctx)
	if err != nil {
		t.Fatalf("first GetWeather: %v", err)
	}
	if first.Temperature != 72.5 {
		t.Errorf("temperature = %v, want 72.5", first.Temperature)
	}
	for i := 0; i < 10; i++ {
		if _, err := svc.GetWeather(ctx); err != nil {
			t.Fatalf("cached GetWeather: %v", err)
		}
	}
	if got := calls.Load(); got != 1 {
		t.Errorf("upstream forecast calls = %d, want 1", got)
	}
}

// Concurrent cold-start callers must collapse into a single upstream fetch.
func TestGetWeatherSingleFlight(t *testing.T) {
	database := setupWeatherDB(t)
	var calls atomic.Int64
	srv := fakeOpenMeteo(t, &calls, 50*time.Millisecond)
	defer srv.Close()

	svc := newTestWeatherService(t, database, srv.URL)

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, err := svc.GetWeather(context.Background()); err != nil {
				t.Errorf("GetWeather: %v", err)
			}
		}()
	}
	wg.Wait()

	if got := calls.Load(); got != 1 {
		t.Errorf("upstream forecast calls = %d, want 1 (single-flight)", got)
	}
}

// When upstream fails, the last good snapshot is served instead of an error,
// so client retries cannot hammer the rate-limited API.
func TestGetWeatherServesStaleOnUpstreamFailure(t *testing.T) {
	database := setupWeatherDB(t)
	var calls atomic.Int64
	srv := fakeOpenMeteo(t, &calls, 0)

	svc := newTestWeatherService(t, database, srv.URL)
	if _, err := svc.GetWeather(context.Background()); err != nil {
		t.Fatalf("initial fetch: %v", err)
	}
	srv.Close()

	// Force the cache stale, then break upstream.
	if err := svc.Refresh(context.Background()); err == nil {
		t.Fatal("expected refresh against closed server to fail")
	}
	data, err := svc.GetWeather(context.Background())
	if err != nil {
		t.Fatalf("GetWeather after upstream failure: %v", err)
	}
	if data.Temperature != 72.5 {
		t.Errorf("stale temperature = %v, want 72.5", data.Temperature)
	}
}

// Refresh (the scheduler path) bypasses the fresh window.
func TestRefreshForcesUpstreamFetch(t *testing.T) {
	database := setupWeatherDB(t)
	var calls atomic.Int64
	srv := fakeOpenMeteo(t, &calls, 0)
	defer srv.Close()

	svc := newTestWeatherService(t, database, srv.URL)
	if _, err := svc.GetWeather(context.Background()); err != nil {
		t.Fatal(err)
	}
	if err := svc.Refresh(context.Background()); err != nil {
		t.Fatal(err)
	}
	if got := calls.Load(); got != 2 {
		t.Errorf("upstream forecast calls = %d, want 2", got)
	}
}
