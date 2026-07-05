package api

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type CalendarHandler struct {
	svc      *service.CalendarService
	hub      *Hub
	location *time.Location
}

func NewCalendarHandler(svc *service.CalendarService, hub *Hub, location *time.Location) *CalendarHandler {
	if location == nil {
		location = time.UTC
	}
	return &CalendarHandler{svc: svc, hub: hub, location: location}
}

func (h *CalendarHandler) ListSources(w http.ResponseWriter, r *http.Request) {
	sources, err := h.svc.ListSources()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list sources")
		return
	}
	if sources == nil {
		sources = []service.CalendarSource{}
	}
	writeJSON(w, http.StatusOK, sources)
}

func (h *CalendarHandler) CreateSource(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name         string `json:"name"`
		Type         string `json:"type"`
		URL          string `json:"url"`
		CalendarName string `json:"calendarName"`
		Username     string `json:"username"`
		Password     string `json:"password"`
		Color        string `json:"color"`
		SyncInterval int    `json:"syncInterval"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == "" || req.URL == "" || req.Color == "" {
		writeError(w, http.StatusBadRequest, "name, url, and color are required")
		return
	}
	if req.Type != "caldav" && req.Type != "ics_url" {
		writeError(w, http.StatusBadRequest, "type must be 'caldav' or 'ics_url'")
		return
	}

	src, err := h.svc.CreateSource(req.Name, req.Type, req.URL, req.CalendarName, req.Username, req.Password, req.Color, req.SyncInterval)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create source")
		return
	}

	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()
		count, err := h.svc.SyncSource(ctx, src.ID)
		if err != nil {
			h.hub.Broadcast("calendar_sync_error", map[string]string{"sourceId": src.ID, "error": err.Error()})
			return
		}
		h.hub.Broadcast("calendar_synced", map[string]any{"sourceId": src.ID, "eventCount": count})
	}()

	writeJSON(w, http.StatusCreated, src)
}

func (h *CalendarHandler) UpdateSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req struct {
		Name         *string `json:"name"`
		Type         *string `json:"type"`
		URL          *string `json:"url"`
		CalendarName *string `json:"calendarName"`
		Username     *string `json:"username"`
		Password     *string `json:"password"`
		Color        *string `json:"color"`
		Active       *bool   `json:"active"`
		SyncInterval *int    `json:"syncInterval"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if err := h.svc.UpdateSource(id, req.Name, req.Type, req.URL, req.CalendarName, req.Username, req.Password, req.Color, req.Active, req.SyncInterval); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to update source")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *CalendarHandler) ListRemoteCalendars(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	calendars, err := h.svc.ListRemoteCalendars(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to list remote calendars: "+err.Error())
		return
	}
	if calendars == nil {
		calendars = []service.RemoteCalendar{}
	}
	writeJSON(w, http.StatusOK, calendars)
}

func (h *CalendarHandler) DeleteSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteSource(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete source")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *CalendarHandler) SyncSource(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		count, err := h.svc.SyncSource(ctx, id)
		if err != nil {
			h.hub.Broadcast("calendar_sync_error", map[string]string{"sourceId": id, "error": err.Error()})
			return
		}
		h.hub.Broadcast("calendar_synced", map[string]any{"sourceId": id, "eventCount": count})
	}()
	writeJSON(w, http.StatusOK, map[string]string{"status": "sync_started"})
}

func (h *CalendarHandler) GetEvents(w http.ResponseWriter, r *http.Request) {
	startStr := r.URL.Query().Get("start")
	endStr := r.URL.Query().Get("end")

	var start, end time.Time
	var err error

	if startStr != "" {
		start, err = time.Parse(time.RFC3339, startStr)
		if err != nil {
			start, err = time.Parse("2006-01-02", startStr)
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid start date")
			return
		}
	} else {
		start = time.Now().Truncate(24 * time.Hour)
	}

	if endStr != "" {
		end, err = time.Parse(time.RFC3339, endStr)
		if err != nil {
			end, err = time.Parse("2006-01-02", endStr)
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid end date")
			return
		}
	} else {
		end = start.Add(24 * time.Hour)
	}

	events, err := h.svc.GetEvents(start, end)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get events")
		return
	}
	if events == nil {
		events = []service.CalendarEvent{}
	}
	writeJSON(w, http.StatusOK, events)
}

func (h *CalendarHandler) CreateEvent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		SourceID     string `json:"sourceId"`
		CalendarName string `json:"calendarName"`
		Title        string `json:"title"`
		Description  string `json:"description"`
		Location     string `json:"location"`
		StartAt      string `json:"startAt"`
		EndAt        string `json:"endAt"`
		AllDay       bool   `json:"allDay"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.SourceID = strings.TrimSpace(req.SourceID)
	req.Title = strings.TrimSpace(req.Title)
	if req.SourceID == "" || req.Title == "" || req.StartAt == "" {
		writeError(w, http.StatusBadRequest, "sourceId, title, and startAt are required")
		return
	}

	start, err := time.Parse(time.RFC3339, req.StartAt)
	if err != nil {
		start, err = time.ParseInLocation("2006-01-02T15:04", req.StartAt, h.location)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid startAt format")
			return
		}
	}

	var end time.Time
	if req.EndAt != "" {
		end, err = time.Parse(time.RFC3339, req.EndAt)
		if err != nil {
			end, err = time.ParseInLocation("2006-01-02T15:04", req.EndAt, h.location)
			if err != nil {
				writeError(w, http.StatusBadRequest, "invalid endAt format")
				return
			}
		}
	} else if req.AllDay {
		end = start.Add(24 * time.Hour)
	} else {
		end = start.Add(1 * time.Hour)
	}

	if !end.After(start) {
		writeError(w, http.StatusBadRequest, "endAt must be after startAt")
		return
	}

	ev, err := h.svc.CreateEvent(r.Context(), req.SourceID, strings.TrimSpace(req.CalendarName), req.Title, req.Description, strings.TrimSpace(req.Location), start, end, req.AllDay)
	if err != nil {
		writeError(w, http.StatusBadRequest, "failed to create event: "+err.Error())
		return
	}
	h.hub.Broadcast("calendar_synced", map[string]string{"status": "event_created"})
	writeJSON(w, http.StatusCreated, ev)
}

func (h *CalendarHandler) DeleteEvent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.DeleteEvent(id); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete event")
		return
	}
	h.hub.Broadcast("calendar_synced", map[string]string{"status": "event_deleted"})
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *CalendarHandler) SyncNow(w http.ResponseWriter, r *http.Request) {
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
		defer cancel()
		h.svc.SyncAllSources(ctx)
		h.hub.Broadcast("calendar_synced", map[string]string{"status": "complete"})
	}()
	writeJSON(w, http.StatusOK, map[string]string{"status": "sync_started"})
}
