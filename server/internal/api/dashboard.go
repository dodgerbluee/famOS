package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/sandershome/server/internal/ai"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/service"
	"golang.org/x/sync/errgroup"
)

type DashboardHandler struct {
	db       *db.DB
	cash     *service.SandersCashService
	cal      *service.CalendarService
	chores   *service.ChoreTemplateService
	weather  *service.WeatherService
	ai       *ai.Engine
	gatus    *service.GatusService
	seerr    *service.SeerrService
	vikunja  *service.VikunjaService
	currency *service.CurrencyService
	location *time.Location
}

type DashboardEvent struct {
	ID                  string `json:"id"`
	SourceID            string `json:"sourceId"`
	ExternalID          string `json:"externalId"`
	Title               string `json:"title"`
	Location            string `json:"location"`
	StartAt             string `json:"startAt"`
	EndAt               string `json:"endAt"`
	AllDay              bool   `json:"allDay"`
	SourceColor         string `json:"sourceColor"`
	SourceName          string `json:"sourceName"`
	SourceCalendarName  string `json:"sourceCalendarName"`
	SourceCalendarColor string `json:"sourceCalendarColor"`
}

type DashboardResponse struct {
	Settings       map[string]string                    `json:"settings"`
	Accounts       []service.AccountWithMember          `json:"accounts"`
	Events         []DashboardEvent                     `json:"events"`
	ChoreTemplates []service.ChoreTemplateWithStatus    `json:"choreTemplates"`
	Family         []FamilyMember                       `json:"family"`
	Weather        any                                  `json:"weather"`
	Briefing       *ai.DailyBriefing                    `json:"briefing"`
	Gatus          *service.GatusStatus                 `json:"gatus"`
	Seerr          *service.SeerrStatus                 `json:"seerr"`
	Vikunja        *service.VikunjaStatus               `json:"vikunja"`
	AI             map[string]any                       `json:"ai"`
	Errors         map[string]string                    `json:"errors"`
}

func (h *DashboardHandler) Get(w http.ResponseWriter, r *http.Request) {
	resp := DashboardResponse{
		Accounts:       []service.AccountWithMember{},
		Events:         []DashboardEvent{},
		ChoreTemplates: []service.ChoreTemplateWithStatus{},
		Family:         []FamilyMember{},
		Errors:         map[string]string{},
		AI: map[string]any{
			"provider":  h.ai.ProviderName(),
			"available": false,
		},
	}

	settings, err := loadSettingsMap(h.db, h.currency)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	resp.Settings = settings
	needed := dashboardCardSet(settings["home_layout"])

	var mu sync.Mutex
	setErr := func(key, msg string) {
		mu.Lock()
		resp.Errors[key] = msg
		mu.Unlock()
	}

	g, ctx := errgroup.WithContext(r.Context())

	g.Go(func() error {
		accounts, err := h.cash.ListAccounts()
		if err != nil {
			setErr("accounts", err.Error())
			return nil
		}
		mu.Lock()
		if accounts != nil {
			resp.Accounts = accounts
		}
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["day-calendar"] && !needed["week-calendar"] && !needed["month-calendar"] {
			return nil
		}
		now := time.Now().In(h.location)
		start := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, h.location).AddDate(0, 0, -7)
		end := start.AddDate(0, 1, 14)
		events, err := h.cal.GetEvents(start, end)
		if err != nil {
			setErr("events", err.Error())
			return nil
		}
		out := make([]DashboardEvent, 0, len(events))
		for _, ev := range events {
			out = append(out, DashboardEvent{
				ID:                  ev.ID,
				SourceID:            ev.SourceID,
				ExternalID:          ev.ExternalID,
				Title:               ev.Title,
				Location:            ev.Location,
				StartAt:             ev.StartAt,
				EndAt:               ev.EndAt,
				AllDay:              ev.AllDay,
				SourceColor:         ev.SourceColor,
				SourceName:          ev.SourceName,
				SourceCalendarName:  ev.SourceCalendarName,
				SourceCalendarColor: ev.SourceCalendarColor,
			})
		}
		mu.Lock()
		resp.Events = out
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["chores"] && !needed["sanders-cash"] {
			// family is still useful for chores; fetch when chores shown
		}
		members, err := listFamilyMembers(h.db)
		if err != nil {
			setErr("family", err.Error())
			return nil
		}
		mu.Lock()
		resp.Family = members
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["chores"] {
			return nil
		}
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		templates, err := h.chores.ListTemplatesWithStatus(cctx)
		if err != nil {
			setErr("choreTemplates", err.Error())
			return nil
		}
		mu.Lock()
		if templates != nil {
			resp.ChoreTemplates = templates
		}
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["weather"] && !needed["briefing"] {
			return nil
		}
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		weather, err := h.weather.GetWeather(cctx)
		if err != nil {
			setErr("weather", err.Error())
			return nil
		}
		mu.Lock()
		resp.Weather = weather
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		briefing := h.ai.CachedBriefing()
		mu.Lock()
		resp.Briefing = briefing
		if briefing != nil {
			resp.AI["available"] = true
		}
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["services"] {
			return nil
		}
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		status, err := h.gatus.GetStatus(cctx)
		if err != nil {
			setErr("gatus", err.Error())
			return nil
		}
		mu.Lock()
		resp.Gatus = status
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["media"] {
			return nil
		}
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		status, err := h.seerr.GetRequests(cctx)
		if err != nil {
			setErr("seerr", err.Error())
			return nil
		}
		mu.Lock()
		resp.Seerr = status
		mu.Unlock()
		return nil
	})

	g.Go(func() error {
		if !needed["tasks"] {
			return nil
		}
		cctx, cancel := context.WithTimeout(ctx, 3*time.Second)
		defer cancel()
		status, err := h.vikunja.GetTasks(cctx)
		if err != nil {
			setErr("vikunja", err.Error())
			return nil
		}
		if status != nil && len(status.Tasks) > 20 {
			status.Tasks = status.Tasks[:20]
		}
		mu.Lock()
		resp.Vikunja = status
		mu.Unlock()
		return nil
	})

	if err := g.Wait(); err != nil {
		log.Printf("dashboard: %v", err)
	}

	w.Header().Set("Cache-Control", "private, max-age=10")
	writeJSON(w, http.StatusOK, resp)
}

func listFamilyMembers(database *db.DB) ([]FamilyMember, error) {
	rows, err := database.Query(`SELECT id, name, role, avatar_url, color, sort_order, COALESCE(birthday, ''), COALESCE(vikunja_project_id, 0), CASE WHEN COALESCE(password_hash, '') != '' THEN 1 ELSE 0 END, COALESCE(username, ''), created_at FROM family_members WHERE role != 'kiosk' ORDER BY sort_order, name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var canLogin int
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.Birthday, &m.VikunjaProjectID, &canLogin, &m.Username, &m.CreatedAt); err != nil {
			return nil, err
		}
		m.CanLogin = canLogin == 1
		members = append(members, m)
	}
	return members, nil
}

func dashboardCardSet(rawLayout string) map[string]bool {
	needed := map[string]bool{
		"briefing": true, "day-calendar": true, "week-calendar": true, "month-calendar": true,
		"chores": true, "tasks": true, "services": true, "media": true, "sanders-cash": true, "weather": true,
	}
	if rawLayout == "" {
		return needed
	}
	var parsed struct {
		Cards []struct {
			ID string `json:"id"`
		} `json:"cards"`
	}
	if err := json.Unmarshal([]byte(rawLayout), &parsed); err != nil || len(parsed.Cards) == 0 {
		return needed
	}
	out := map[string]bool{}
	for _, c := range parsed.Cards {
		out[c.ID] = true
	}
	return out
}
