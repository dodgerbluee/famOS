package api

import (
	"net/http"

	"github.com/sandershome/server/internal/service"
)

type WeatherHandler struct {
	svc *service.WeatherService
}

func NewWeatherHandler(svc *service.WeatherService) *WeatherHandler {
	return &WeatherHandler{svc: svc}
}

func (h *WeatherHandler) GetWeather(w http.ResponseWriter, r *http.Request) {
	data, err := h.svc.GetWeather(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, data)
}
