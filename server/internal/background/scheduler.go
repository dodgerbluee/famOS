package background

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/service"
)

type BroadcastFunc func(msgType string, payload any)

type Scheduler struct {
	calendar  *service.CalendarService
	weather   *service.WeatherService
	cash      *service.SandersCashService
	engine    *ai.Engine
	batch     *service.BatchService
	broadcast BroadcastFunc
	timezone  string
}

func NewScheduler(
	calendar *service.CalendarService,
	weather *service.WeatherService,
	cash *service.SandersCashService,
	engine *ai.Engine,
	batch *service.BatchService,
	broadcast BroadcastFunc,
	timezone string,
) *Scheduler {
	return &Scheduler{
		calendar:  calendar,
		weather:   weather,
		cash:      cash,
		engine:    engine,
		batch:     batch,
		broadcast: broadcast,
		timezone:  timezone,
	}
}

func (s *Scheduler) Start(ctx context.Context) {
	go s.runCalendarSync(ctx)
	go s.runDailyBriefing(ctx)
}

func (s *Scheduler) runCalendarSync(ctx context.Context) {
	results := s.calendar.SyncAllSources(ctx)
	s.broadcast("calendar_synced", map[string]any{"status": "complete", "results": results})

	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			log.Println("running scheduled calendar sync...")
			results := s.calendar.SyncAllSources(ctx)
			s.broadcast("calendar_synced", map[string]any{"status": "complete", "results": results})
		}
	}
}

func (s *Scheduler) runDailyBriefing(ctx context.Context) {
	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}

	for {
		now := time.Now().In(loc)
		next := time.Date(now.Year(), now.Month(), now.Day(), 5, 0, 0, 0, loc)
		if now.After(next) {
			next = next.Add(24 * time.Hour)
		}

		wait := time.Until(next)
		log.Printf("next daily briefing scheduled at %s (in %s)", next.Format(time.RFC3339), wait.Round(time.Minute))

		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
			s.generateBriefing(ctx)
		}
	}
}

func (s *Scheduler) GenerateBriefingNow(ctx context.Context) {
	s.generateBriefing(ctx)
}

func (s *Scheduler) generateBriefing(ctx context.Context) {
	runID := s.batch.StartRun("daily_briefing")
	log.Println("generating daily AI briefing...")

	loc, err := time.LoadLocation(s.timezone)
	if err != nil {
		loc = time.UTC
	}
	today := time.Now().In(loc)
	start := time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	end := start.Add(24 * time.Hour)

	events, _ := s.calendar.GetEvents(start, end)
	eventsJSON, _ := json.Marshal(events)

	weatherData, _ := s.weather.GetWeather(ctx)
	weatherJSON, _ := json.Marshal(weatherData)

	accounts, _ := s.cash.ListAccounts()
	cashJSON, _ := json.Marshal(accounts)

	briefing, err := s.engine.GenerateDailyBriefing(ctx, string(eventsJSON), string(weatherJSON), string(cashJSON), true)
	if err != nil {
		log.Printf("daily briefing generation failed: %v", err)
		s.batch.FailRun(runID, err.Error())
		s.broadcast("batch_run_complete", map[string]string{"job": "daily_briefing", "status": "error"})
		return
	}

	result, _ := json.Marshal(briefing)
	s.batch.CompleteRun(runID, string(result))
	s.broadcast("batch_run_complete", map[string]string{"job": "daily_briefing", "status": "success"})
	log.Println("daily briefing generated successfully")
}
