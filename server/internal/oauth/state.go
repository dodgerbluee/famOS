package oauth

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

const stateTTL = 10 * time.Minute

type StoredState struct {
	CodeVerifier string
	Nonce        string
	RedirectURI  string
	ProviderName string
}

func CreateState(database *db.DB, state, codeVerifier, nonce, redirectURI, providerName string) error {
	_, err := database.Exec(
		`INSERT INTO oauth_states (id, state, code_verifier, nonce, redirect_uri, provider_name)
		 VALUES (?, ?, ?, ?, ?, ?)`,
		uuid.New().String(), state, codeVerifier, nonce, redirectURI, providerName,
	)
	return err
}

func ConsumeState(database *db.DB, state string) (*StoredState, error) {
	cutoff := time.Now().UTC().Add(-stateTTL).Format("2006-01-02 15:04:05")
	var stored StoredState
	err := database.QueryRow(
		`DELETE FROM oauth_states
		 WHERE state = ? AND created_at > ?
		 RETURNING code_verifier, nonce, COALESCE(redirect_uri, ''), COALESCE(provider_name, '')`,
		state, cutoff,
	).Scan(&stored.CodeVerifier, &stored.Nonce, &stored.RedirectURI, &stored.ProviderName)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &stored, nil
}

func CleanExpiredStates(database *db.DB) {
	cutoff := time.Now().UTC().Add(-stateTTL).Format("2006-01-02 15:04:05")
	database.Exec(`DELETE FROM oauth_states WHERE created_at <= ?`, cutoff)
}
