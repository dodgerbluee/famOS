package api

import (
	"net/http"
	"strconv"

	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/service"
)

type ActivityHandler struct{ svc *service.ActivityService }

func (h *ActivityHandler) List(w http.ResponseWriter, r *http.Request) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		writeError(w, http.StatusUnauthorized, "authentication required")
		return
	}
	days, _ := strconv.Atoi(r.URL.Query().Get("days"))
	if days == 0 {
		days = 84
	}
	result, err := h.svc.List(r.Context(), user.FamilyID, days)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to load activity")
		return
	}
	writeJSON(w, http.StatusOK, result)
}
