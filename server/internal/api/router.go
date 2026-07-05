package api

import (
	"io/fs"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/background"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/frigate"
	"github.com/sandershome/server/internal/service"
)

type Services struct {
	Calendar *service.CalendarService
	Cash     *service.SandersCashService
	Rewards  *service.RewardsService
	Weather  *service.WeatherService
	AI       *ai.Engine
	Frigate  *frigate.Client
}

func NewServices(database *db.DB, cfg *config.Config) *Services {
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		loc = time.UTC
	}
	cash := service.NewSandersCashService(database)
	return &Services{
		Calendar: service.NewCalendarService(database, loc),
		Cash:     cash,
		Rewards:  service.NewRewardsService(database, cash),
		Weather:  service.NewWeatherService(database, cfg.LocationLat, cfg.LocationLon, cfg.Timezone),
		AI:       ai.NewEngine(cfg, database),
		Frigate:  frigate.NewClient(cfg.FrigateURL),
	}
}

func NewRouter(database *db.DB, cfg *config.Config, svc *Services, hub *Hub, batchSvc *service.BatchService, scheduler *background.Scheduler) http.Handler {
	r := chi.NewRouter()

	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{cfg.FrontendURL, "http://localhost:5173", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	familyHandler := &FamilyHandler{db: database}
	authHandler := &AuthHandler{db: database, cfg: cfg}
	cashHandler := NewSandersCashHandler(svc.Cash, hub)
	rewardsHandler := NewRewardsHandler(svc.Rewards, hub)
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		loc = time.UTC
	}
	calendarHandler := NewCalendarHandler(svc.Calendar, hub, loc)
	weatherHandler := NewWeatherHandler(svc.Weather)
	aiHandler := NewAIHandler(svc.AI, svc.Weather, svc.Calendar, svc.Cash)
	camerasHandler := NewCamerasHandler(svc.Frigate, hub)
	settingsHandler := &SettingsHandler{db: database, frigate: svc.Frigate}
	aiProvidersHandler := NewAIProvidersHandler(database, svc.AI, cfg)
	gatusHandler := NewGatusHandler(service.NewGatusService(database))
	seerrHandler := NewSeerrHandler(service.NewSeerrService(database))
	batchHandler := NewBatchHandler(batchSvc, scheduler)
	vikunjaHandler := NewVikunjaHandler(service.NewVikunjaService(database))
	choresHandler := NewChoresHandler(service.NewChoresService(database, svc.Cash), hub)

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"timezone": cfg.Timezone})
	})

	r.Route("/api/auth", func(r chi.Router) {
		r.Post("/login", authHandler.Login)
		r.Post("/verify", authHandler.Verify)
	})

	r.Route("/api/family", func(r chi.Router) {
		r.Get("/", familyHandler.List)
		r.Post("/", familyHandler.Create)
		r.Get("/{id}", familyHandler.Get)
		r.Put("/{id}", familyHandler.Update)
		r.Delete("/{id}", familyHandler.Delete)
	})

	r.Route("/api/sanders-cash", func(r chi.Router) {
		r.Get("/accounts", cashHandler.ListAccounts)
		r.Get("/accounts/{memberId}", cashHandler.GetAccount)
		r.Post("/transactions", cashHandler.CreateTransaction)
		r.Get("/transactions/{accountId}", cashHandler.GetTransactions)
		r.Post("/quick-award/{memberId}", cashHandler.QuickAward)
	})

	r.Route("/api/rewards", func(r chi.Router) {
		r.Get("/", rewardsHandler.ListRewards)
		r.Post("/", rewardsHandler.CreateReward)
		r.Put("/{id}", rewardsHandler.UpdateReward)
		r.Delete("/{id}", rewardsHandler.DeleteReward)
		r.Post("/redeem", rewardsHandler.RequestRedemption)
		r.Get("/redemptions", rewardsHandler.ListRedemptions)
		r.Put("/redemptions/{id}", rewardsHandler.ResolveRedemption)
	})

	r.Route("/api/calendar", func(r chi.Router) {
		r.Get("/sources", calendarHandler.ListSources)
		r.Get("/sources/{id}/remote-calendars", calendarHandler.ListRemoteCalendars)
		r.Post("/sources", calendarHandler.CreateSource)
		r.Post("/sources/{id}/sync", calendarHandler.SyncSource)
		r.Put("/sources/{id}", calendarHandler.UpdateSource)
		r.Delete("/sources/{id}", calendarHandler.DeleteSource)
		r.Get("/events", calendarHandler.GetEvents)
		r.Post("/events", calendarHandler.CreateEvent)
		r.Delete("/events/{id}", calendarHandler.DeleteEvent)
		r.Post("/sync", calendarHandler.SyncNow)
	})

	r.Route("/api/cameras", func(r chi.Router) {
		r.Get("/", camerasHandler.ListCameras)
		r.Get("/frigate/open", camerasHandler.OpenFrigate)
		r.Get("/status", camerasHandler.GetStatus)
		r.Get("/{name}/snapshot", camerasHandler.GetSnapshot)
		r.Get("/{name}/stream", StreamProxy(svc.Frigate))
		r.Get("/events", camerasHandler.ListEvents)
		r.Get("/events/{eventId}/thumbnail", camerasHandler.GetEventThumbnail)
	})

	r.Route("/api/settings", func(r chi.Router) {
		r.Get("/", settingsHandler.Get)
		r.Put("/", settingsHandler.Update)
		r.Post("/mqtt/test", settingsHandler.TestMQTT)
	})

	r.Get("/api/weather", weatherHandler.GetWeather)

	r.Route("/api/ai", func(r chi.Router) {
		r.Get("/status", aiHandler.GetStatus)
		r.Get("/briefing", aiHandler.GetDailyBriefing)
		r.Post("/briefing", aiHandler.RegenerateDailyBriefing)
		r.Get("/weather-insight", aiHandler.GetWeatherInsight)
		r.Get("/providers", aiProvidersHandler.List)
		r.Post("/providers", aiProvidersHandler.Create)
		r.Put("/providers/{id}", aiProvidersHandler.Update)
		r.Delete("/providers/{id}", aiProvidersHandler.Delete)
		r.Post("/providers/test", aiProvidersHandler.TestConnection)
		r.Get("/providers/{id}/models", aiProvidersHandler.ListModels)
	})

	r.Get("/api/gatus/status", gatusHandler.GetStatus)
	r.Get("/api/seerr/requests", seerrHandler.GetRequests)

	r.Route("/api/batch", func(r chi.Router) {
		r.Get("/runs", batchHandler.ListRuns)
		r.Post("/trigger/briefing", batchHandler.TriggerBriefing)
	})

	r.Get("/api/vikunja/tasks", vikunjaHandler.GetTasks)

	r.Route("/api/chores", func(r chi.Router) {
		r.Get("/", choresHandler.List)
		r.Post("/", choresHandler.Create)
		r.Put("/{id}", choresHandler.Update)
		r.Delete("/{id}", choresHandler.Delete)
		r.Post("/{id}/complete", choresHandler.Complete)
		r.Post("/{id}/uncomplete", choresHandler.Uncomplete)
	})

	r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
		ServeWS(hub, w, r)
	})

	if staticDir := cfg.StaticDir; staticDir != "" {
		r.NotFound(spaHandler(staticDir))
	}

	return r
}

func spaHandler(staticDir string) http.HandlerFunc {
	fileServer := http.FileServer(http.Dir(staticDir))
	return func(w http.ResponseWriter, r *http.Request) {
		path := filepath.Clean(r.URL.Path)
		if strings.HasPrefix(path, "/api/") || path == "/ws" {
			http.NotFound(w, r)
			return
		}
		fullPath := filepath.Join(staticDir, path)
		if _, err := fs.Stat(os.DirFS(staticDir), strings.TrimPrefix(path, "/")); err != nil {
			http.ServeFile(w, r, filepath.Join(staticDir, "index.html"))
			return
		}
		_ = fullPath
		fileServer.ServeHTTP(w, r)
	}
}
