package service

import (
	"encoding/json"

	"github.com/sandershome/server/internal/db"
)

type CurrencyService struct {
	db *db.DB
}

func NewCurrencyService(database *db.DB) *CurrencyService {
	return &CurrencyService{db: database}
}

func (s *CurrencyService) GetCurrencyName() string {
	var raw string
	err := s.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'currency_name'`).Scan(&raw)
	if err == nil && raw != "" {
		var name string
		if json.Unmarshal([]byte(raw), &name) == nil && name != "" {
			return name
		}
	}

	var familyName string
	err = s.db.QueryRow(`SELECT name FROM families LIMIT 1`).Scan(&familyName)
	if err == nil && familyName != "" {
		return familyName + " Cash"
	}

	return "Family Cash"
}
