package ai

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

type Engine struct {
	provider Provider
	db       *db.DB
	location *time.Location
}

func NewEngine(cfg *config.Config, database *db.DB) *Engine {
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		loc = time.UTC
	}
	e := &Engine{db: database, location: loc}
	e.loadActiveProvider(cfg)
	return e
}

func (e *Engine) loadActiveProvider(cfg *config.Config) {
	var url, apiKey, model string
	err := e.db.QueryRow(`SELECT url, api_key, model FROM ai_providers WHERE active = 1 LIMIT 1`).Scan(&url, &apiKey, &model)
	if err == nil && url != "" {
		e.provider = NewOllamaProviderWithKey(url, model, apiKey)
		return
	}
	e.provider = NewOllamaProvider(cfg.OllamaURL, cfg.OllamaModel)
}

func (e *Engine) Reload(cfg *config.Config) {
	e.loadActiveProvider(cfg)
}

func (e *Engine) IsAvailable(ctx context.Context) bool {
	return e.provider.Available(ctx)
}

func (e *Engine) ProviderName() string {
	return e.provider.Name()
}

type EventEnrichment struct {
	Summary     string `json:"summary"`
	WeatherNote string `json:"weatherNote"`
	PrepNote    string `json:"prepNote"`
}

type DailyBriefing struct {
	Date               string   `json:"date"`
	Summary            string   `json:"summary"`
	Highlights         []string `json:"highlights"`
	WeatherSummary     string   `json:"weatherSummary"`
	CalendarSummary    string   `json:"calendarSummary"`
	SandersCashSummary string   `json:"sandersCashSummary"`
}

type WeatherInsight struct {
	Summary    string `json:"summary"`
	Alerts     string `json:"alerts"`
	Suggestion string `json:"suggestion"`
}

func (e *Engine) EnrichCalendarEvent(ctx context.Context, title, description, location string, startAt time.Time, weatherContext string) (*EventEnrichment, error) {
	cacheKey := fmt.Sprintf("enrich:%s:%s", title, startAt.Format("2006-01-02"))
	if cached := e.getCache(cacheKey); cached != "" {
		var result EventEnrichment
		if json.Unmarshal([]byte(cached), &result) == nil {
			return &result, nil
		}
	}

	prompt := fmt.Sprintf(`Given this calendar event, provide brief helpful context.

Event: %s
Time: %s
Location: %s
Description: %s
Current Weather Context: %s

Respond in JSON with these fields:
- "summary": One sentence about what to note for this event
- "weatherNote": Weather-related note if relevant (empty string if not)
- "prepNote": Any preparation reminder (empty string if not needed)

Keep each field under 100 characters. Be practical and helpful.`, title, startAt.Format("Monday Jan 2, 3:04 PM"), location, description, weatherContext)

	resp, err := e.complete(ctx, CompletionRequest{
		System:      "You are a helpful family assistant. Respond only in valid JSON.",
		Prompt:      prompt,
		MaxTokens:   300,
		Temperature: 0.3,
	})
	if err != nil {
		return nil, err
	}

	var result EventEnrichment
	if err := json.Unmarshal([]byte(extractJSON(resp.Text)), &result); err != nil {
		result = EventEnrichment{Summary: resp.Text}
	}

	if data, err := json.Marshal(result); err == nil {
		e.setCache(cacheKey, string(data), 24*time.Hour)
	}

	return &result, nil
}

func (e *Engine) GenerateDailyBriefing(ctx context.Context, eventsJSON, weatherJSON, cashJSON string, refresh bool) (*DailyBriefing, error) {
	now := time.Now().In(e.location)
	today := now.Format("2006-01-02")
	partOfDay := currentPartOfDay(now)
	cacheKey := "briefing:" + today + ":" + partOfDay

	if !refresh {
		if cached := e.getCache(cacheKey); cached != "" {
			var result DailyBriefing
			if json.Unmarshal([]byte(cached), &result) == nil {
				return &result, nil
			}
		}
	}

	type legacyDailyBriefing struct {
		Date               string   `json:"date"`
		Summary            string   `json:"summary"`
		Highlights         []string `json:"highlights"`
		WeatherSummary     string   `json:"weatherSummary"`
		CalendarSummary    string   `json:"calendarSummary"`
		SandersCashNote    string   `json:"sandersCashNote"`
		SandersCashSummary string   `json:"sandersCashSummary"`
	}

	prompt := fmt.Sprintf(`Create a family daily briefing for today.

Current part of day: %s.

Today's Events: %s
Weather: %s
Sanders Cash Activity: %s

Respond in JSON:
- "date": "%s"
- "summary": 2-3 sentence overview of the day
- "highlights": array of 2-4 key things to know today
- "weatherSummary": one sentence weather summary with practical advice
- "calendarSummary": one sentence about today's schedule
- "sandersCashSummary": one sentence about recent kids' earnings (or empty string)

Do not start with a greeting like "good morning". Make the tone naturally fit the current part of day.
Be warm, practical, and family-friendly. Keep it concise.`, partOfDay, eventsJSON, weatherJSON, cashJSON, today)

	resp, err := e.complete(ctx, CompletionRequest{
		System:      "You are a warm, helpful family assistant named SandersHome. Respond only in valid JSON.",
		Prompt:      prompt,
		MaxTokens:   500,
		Temperature: 0.5,
	})
	if err != nil {
		return nil, err
	}

	var result DailyBriefing
	var legacy legacyDailyBriefing
	jsonText := extractJSON(resp.Text)
	if err := json.Unmarshal([]byte(jsonText), &result); err != nil {
		if err := json.Unmarshal([]byte(jsonText), &legacy); err == nil {
			result = DailyBriefing{
				Date:               legacy.Date,
				Summary:            legacy.Summary,
				Highlights:         legacy.Highlights,
				WeatherSummary:     legacy.WeatherSummary,
				CalendarSummary:    legacy.CalendarSummary,
				SandersCashSummary: firstNonEmptyBriefing(legacy.SandersCashSummary, legacy.SandersCashNote),
			}
		} else {
			result = DailyBriefing{Date: today, Summary: resp.Text}
		}
	}
	result.Date = today
	if result.Summary == "" {
		result.Summary = "Your daily briefing is ready, but the AI response came back without a summary."
	}

	if data, err := json.Marshal(result); err == nil {
		e.setCache(cacheKey, string(data), 12*time.Hour)
	}

	return &result, nil
}

func currentPartOfDay(now time.Time) string {
	hour := now.Hour()
	switch {
	case hour < 12:
		return "morning"
	case hour < 17:
		return "afternoon"
	case hour < 21:
		return "evening"
	default:
		return "night"
	}
}

func firstNonEmptyBriefing(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func (e *Engine) InterpretWeather(ctx context.Context, weatherJSON string) (*WeatherInsight, error) {
	today := time.Now().Format("2006-01-02")
	cacheKey := "weather_insight:" + today

	if cached := e.getCache(cacheKey); cached != "" {
		var result WeatherInsight
		if json.Unmarshal([]byte(cached), &result) == nil {
			return &result, nil
		}
	}

	prompt := fmt.Sprintf(`Interpret this weather data for a family.

%s

Respond in JSON:
- "summary": 1-2 sentences about today's weather in plain, friendly language
- "alerts": any notable alerts like high pollen, UV, or rain (empty string if none)
- "suggestion": a practical suggestion for the family (what to wear, outdoor activities, etc.)

Be concise and practical.`, weatherJSON)

	resp, err := e.complete(ctx, CompletionRequest{
		System:      "You are a helpful weather assistant for a family. Respond only in valid JSON.",
		Prompt:      prompt,
		MaxTokens:   300,
		Temperature: 0.3,
	})
	if err != nil {
		return nil, err
	}

	var result WeatherInsight
	if err := json.Unmarshal([]byte(extractJSON(resp.Text)), &result); err != nil {
		result = WeatherInsight{Summary: resp.Text}
	}

	if data, err := json.Marshal(result); err == nil {
		e.setCache(cacheKey, string(data), 3*time.Hour)
	}

	return &result, nil
}

func (e *Engine) getCache(key string) string {
	var content string
	err := e.db.QueryRow(`SELECT content FROM ai_cache WHERE cache_key = ? AND expires_at > CURRENT_TIMESTAMP`, key).Scan(&content)
	if err != nil {
		return ""
	}
	return content
}

func (e *Engine) setCache(key, content string, ttl time.Duration) {
	expires := time.Now().Add(ttl).Format(time.RFC3339)
	_, err := e.db.Exec(`INSERT OR REPLACE INTO ai_cache (id, cache_key, content, expires_at) VALUES (?, ?, ?, ?)`,
		key, key, content, expires)
	if err != nil {
		log.Printf("cache set error: %v", err)
	}
}

func (e *Engine) complete(ctx context.Context, req CompletionRequest) (*CompletionResponse, error) {
	log.Printf("ai.request provider=%s system=%q prompt=%q max_tokens=%d temperature=%.2f", e.provider.Name(), truncateForLog(req.System, 500), truncateForLog(req.Prompt, 4000), req.MaxTokens, req.Temperature)
	resp, err := e.provider.Complete(ctx, req)
	if err != nil {
		log.Printf("ai.error provider=%s err=%v", e.provider.Name(), err)
		return nil, err
	}
	log.Printf("ai.response provider=%s text=%q", e.provider.Name(), truncateForLog(resp.Text, 4000))
	return resp, nil
}

func truncateForLog(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max] + "...(truncated)"
}

func extractJSON(text string) string {
	start := -1
	end := -1
	depth := 0
	for i, c := range text {
		if c == '{' {
			if depth == 0 {
				start = i
			}
			depth++
		}
		if c == '}' {
			depth--
			if depth == 0 {
				end = i + 1
				break
			}
		}
	}
	if start >= 0 && end > start {
		return text[start:end]
	}
	return text
}
