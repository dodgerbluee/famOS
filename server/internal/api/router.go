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
	"github.com/sandershome/server/internal/auth"
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

	// Handlers
	familyHandler := &FamilyHandler{db: database}
	authHandler := &AuthHandler{db: database, cfg: cfg}
	inviteHandler := NewInviteHandler(database, cfg)
	cashHandler := NewSandersCashHandler(svc.Cash, hub)
	rewardsHandler := NewRewardsHandler(svc.Rewards, hub)
	loc, err := time.LoadLocation(cfg.Timezone)
	if err != nil {
		loc = time.UTC
	}
	calendarHandler := NewCalendarHandler(svc.Calendar, hub, loc)
	weatherHandler := NewWeatherHandler(svc.Weather)
	aiHandler := NewAIHandler(svc.AI, svc.Weather, svc.Calendar, svc.Cash, loc)
	camerasHandler := NewCamerasHandler(svc.Frigate, hub)
	settingsHandler := &SettingsHandler{db: database, frigate: svc.Frigate}
	aiProvidersHandler := NewAIProvidersHandler(database, svc.AI, cfg)
	gatusHandler := NewGatusHandler(service.NewGatusService(database))
	seerrHandler := NewSeerrHandler(service.NewSeerrService(database))
	batchHandler := NewBatchHandler(batchSvc, scheduler)
	vikunjaHandler := NewVikunjaHandler(service.NewVikunjaService(database))
	choresHandler := NewChoresHandler(service.NewChoresService(database, svc.Cash), hub)
	immichHandler := NewImmichHandler(service.NewImmichService(database))

	// Middleware
	authMw := auth.AuthMiddleware(database, cfg.SessionSecret)
	optAuth := auth.OptionalAuth(database, cfg.SessionSecret)

	// ── Public routes (no auth) ──

	r.Get("/api/health", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	r.Get("/api/config", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"timezone": cfg.Timezone})
	})

	r.Get("/api/setup/status", authHandler.SetupStatus)
	r.Post("/api/setup", authHandler.Setup)
	r.Post("/api/auth/login", authHandler.Login)
	r.Post("/api/auth/pin-verify", authHandler.PinVerify)
	r.Get("/api/invites/{token}", inviteHandler.Validate)
	r.Post("/api/invites/accept", inviteHandler.Accept)

	// ── Optional auth routes (kiosk-accessible reads) ──

	r.Group(func(r chi.Router) {
		r.Use(optAuth)

		r.Get("/api/family", familyHandler.List)
		r.Get("/api/family/{id}", familyHandler.Get)

		r.Get("/api/sanders-cash/accounts", cashHandler.ListAccounts)
		r.Get("/api/sanders-cash/accounts/{memberId}", cashHandler.GetAccount)
		r.Get("/api/sanders-cash/transactions/{accountId}", cashHandler.GetTransactions)

		r.Get("/api/rewards", rewardsHandler.ListRewards)
		r.Get("/api/rewards/redemptions", rewardsHandler.ListRedemptions)

		r.Get("/api/calendar/sources", calendarHandler.ListSources)
		r.Get("/api/calendar/events", calendarHandler.GetEvents)

		r.Get("/api/cameras", camerasHandler.ListCameras)
		r.Get("/api/cameras/frigate/open", camerasHandler.OpenFrigate)
		r.Get("/api/cameras/status", camerasHandler.GetStatus)
		r.Get("/api/cameras/{name}/snapshot", camerasHandler.GetSnapshot)
		r.Get("/api/cameras/{name}/stream", StreamProxy(svc.Frigate))
		r.Get("/api/cameras/events", camerasHandler.ListEvents)
		r.Get("/api/cameras/events/{eventId}/thumbnail", camerasHandler.GetEventThumbnail)

		r.Get("/api/weather", weatherHandler.GetWeather)

		r.Get("/api/ai/status", aiHandler.GetStatus)
		r.Get("/api/ai/briefing", aiHandler.GetDailyBriefing)
		r.Get("/api/ai/weather-insight", aiHandler.GetWeatherInsight)

		r.Get("/api/gatus/status", gatusHandler.GetStatus)
		r.Get("/api/seerr/requests", seerrHandler.GetRequests)
		r.Get("/api/vikunja/tasks", vikunjaHandler.GetTasks)
		r.Get("/api/vikunja/projects", vikunjaHandler.GetProjects)

		r.Get("/api/chores", choresHandler.List)

		r.Get("/api/immich/album", immichHandler.GetAlbum)
		r.Get("/api/immich/assets/{id}", immichHandler.ProxyAsset)

		r.Get("/api/settings", settingsHandler.Get)

		r.Get("/ws", func(w http.ResponseWriter, r *http.Request) {
			ServeWS(hub, w, r)
		})
	})

	// ── Authenticated routes ──

	r.Group(func(r chi.Router) {
		r.Use(authMw)

		r.Get("/api/auth/me", authHandler.Me)
		r.Post("/api/auth/logout", authHandler.Logout)

		// Family management
		r.With(auth.RequirePermission("family.manage")).Post("/api/family", familyHandler.Create)
		r.With(auth.RequirePermission("family.manage")).Put("/api/family/{id}", familyHandler.Update)
		r.With(auth.RequirePermission("family.manage")).Delete("/api/family/{id}", familyHandler.Delete)

		// Sanders Cash writes
		r.With(auth.RequirePermission("sanders_cash.award")).Post("/api/sanders-cash/transactions", cashHandler.CreateTransaction)
		r.With(auth.RequirePermission("sanders_cash.award")).Post("/api/sanders-cash/quick-award/{memberId}", cashHandler.QuickAward)

		// Rewards writes
		r.With(auth.RequirePermission("rewards.manage")).Post("/api/rewards", rewardsHandler.CreateReward)
		r.With(auth.RequirePermission("rewards.manage")).Put("/api/rewards/{id}", rewardsHandler.UpdateReward)
		r.With(auth.RequirePermission("rewards.manage")).Delete("/api/rewards/{id}", rewardsHandler.DeleteReward)
		r.With(auth.RequirePermission("rewards.redeem")).Post("/api/rewards/redeem", rewardsHandler.RequestRedemption)
		r.With(auth.RequirePermission("rewards.resolve")).Put("/api/rewards/redemptions/{id}", rewardsHandler.ResolveRedemption)

		// Calendar writes
		r.With(auth.RequirePermission("calendar.edit")).Get("/api/calendar/sources/{id}/remote-calendars", calendarHandler.ListRemoteCalendars)
		r.With(auth.RequirePermission("calendar.edit")).Post("/api/calendar/sources", calendarHandler.CreateSource)
		r.With(auth.RequirePermission("calendar.edit")).Post("/api/calendar/sources/{id}/sync", calendarHandler.SyncSource)
		r.With(auth.RequirePermission("calendar.edit")).Put("/api/calendar/sources/{id}", calendarHandler.UpdateSource)
		r.With(auth.RequirePermission("calendar.edit")).Delete("/api/calendar/sources/{id}", calendarHandler.DeleteSource)
		r.With(auth.RequirePermission("calendar.edit")).Post("/api/calendar/events", calendarHandler.CreateEvent)
		r.With(auth.RequirePermission("calendar.edit")).Delete("/api/calendar/events/{id}", calendarHandler.DeleteEvent)
		r.With(auth.RequirePermission("calendar.edit")).Post("/api/calendar/sync", calendarHandler.SyncNow)

		// Chores writes
		r.With(auth.RequirePermission("chores.manage")).Post("/api/chores", choresHandler.Create)
		r.With(auth.RequirePermission("chores.manage")).Put("/api/chores/{id}", choresHandler.Update)
		r.With(auth.RequirePermission("chores.manage")).Delete("/api/chores/{id}", choresHandler.Delete)
		r.With(auth.RequirePermission("chores.complete")).Post("/api/chores/{id}/complete", choresHandler.Complete)
		r.With(auth.RequirePermission("chores.complete")).Post("/api/chores/{id}/uncomplete", choresHandler.Uncomplete)

		// Settings
		r.With(auth.RequirePermission("settings.edit")).Put("/api/settings", settingsHandler.Update)
		r.With(auth.RequirePermission("settings.edit")).Post("/api/settings/mqtt/test", settingsHandler.TestMQTT)

		// AI providers
		r.With(auth.RequirePermission("settings.edit")).Get("/api/ai/providers", aiProvidersHandler.List)
		r.With(auth.RequirePermission("settings.edit")).Post("/api/ai/providers", aiProvidersHandler.Create)
		r.With(auth.RequirePermission("settings.edit")).Put("/api/ai/providers/{id}", aiProvidersHandler.Update)
		r.With(auth.RequirePermission("settings.edit")).Delete("/api/ai/providers/{id}", aiProvidersHandler.Delete)
		r.With(auth.RequirePermission("settings.edit")).Post("/api/ai/providers/test", aiProvidersHandler.TestConnection)
		r.With(auth.RequirePermission("settings.edit")).Get("/api/ai/providers/{id}/models", aiProvidersHandler.ListModels)
		r.With(auth.RequirePermission("settings.edit")).Post("/api/ai/briefing", aiHandler.RegenerateDailyBriefing)

		// Batch
		r.With(auth.RequirePermission("settings.view")).Get("/api/batch/runs", batchHandler.ListRuns)
		r.With(auth.RequirePermission("settings.edit")).Post("/api/batch/trigger/briefing", batchHandler.TriggerBriefing)

		// Immich test
		r.With(auth.RequirePermission("settings.edit")).Post("/api/immich/test", immichHandler.Test)

		// Invites
		r.With(auth.RequirePermission("invites.manage")).Post("/api/invites", inviteHandler.Create)
		r.With(auth.RequirePermission("invites.manage")).Get("/api/invites", inviteHandler.List)
		r.With(auth.RequirePermission("invites.manage")).Delete("/api/invites/{id}", inviteHandler.Revoke)
	})

	// SPA handler
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
