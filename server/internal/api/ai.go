package api

import (
	"context"
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/service"
)

type AIHandler struct {
	engine   *ai.Engine
	weather  *service.WeatherService
	cal      *service.CalendarService
	cash     *service.SandersCashService
	location *time.Location

	briefingMu sync.Mutex // one briefing generation at a time
}

func NewAIHandler(engine *ai.Engine, weather *service.WeatherService, cal *service.CalendarService, cash *service.SandersCashService, location *time.Location) *AIHandler {
	if location == nil {
		location = time.UTC
	}
	return &AIHandler{engine: engine, weather: weather, cal: cal, cash: cash, location: location}
}

func (h *AIHandler) GetStatus(w http.ResponseWriter, r *http.Request) {
	available := h.engine.IsAvailable(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{
		"provider":  h.engine.ProviderName(),
		"available": available,
	})
}

func (h *AIHandler) GetDailyBriefing(w http.ResponseWriter, r *http.Request) {
	h.generateDailyBriefing(w, r, false)
}

func (h *AIHandler) RegenerateDailyBriefing(w http.ResponseWriter, r *http.Request) {
	h.generateDailyBriefing(w, r, true)
}

func (h *AIHandler) generateDailyBriefing(w http.ResponseWriter, r *http.Request, refresh bool) {
	// Fast path: a cached briefing needs neither the lock nor the provider.
	if !refresh {
		if b := h.engine.CachedBriefing(); b != nil {
			writeJSON(w, http.StatusOK, b)
			return
		}
	}

	// Single-flight: concurrent page loads (kiosk + phones) share one
	// generation instead of each firing their own provider call.
	h.briefingMu.Lock()
	defer h.briefingMu.Unlock()
	if !refresh {
		if b := h.engine.CachedBriefing(); b != nil {
			writeJSON(w, http.StatusOK, b)
			return
		}
	}

	// Detached from the request: a browser reload or navigation must not
	// cancel the provider call mid-flight, which left nothing cached and
	// turned every retry into another doomed generation.
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	today := time.Now().In(h.location)
	start := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, h.location)
	end := start.Add(24 * time.Hour)

	events, _ := h.cal.GetEvents(start, end)
	eventsJSON, _ := json.Marshal(events)

	weatherData, _ := h.weather.GetWeather(ctx)
	weatherJSON, _ := json.Marshal(weatherData)

	accounts, _ := h.cash.ListAccounts()
	cashJSON, _ := json.Marshal(accounts)

	briefing, err := h.engine.GenerateDailyBriefing(ctx, string(eventsJSON), string(weatherJSON), string(cashJSON), refresh)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to generate briefing: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, briefing)
}

func (h *AIHandler) GetWeatherInsight(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	weatherData, err := h.weather.GetWeather(ctx)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get weather: "+err.Error())
		return
	}

	weatherJSON, _ := json.Marshal(weatherData)
	insight, err := h.engine.InterpretWeather(ctx, string(weatherJSON))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to interpret weather: "+err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"weather": weatherData,
		"insight": insight,
	})
}
