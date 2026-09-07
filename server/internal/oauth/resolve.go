package oauth

import (
	"database/sql"
	"errors"
	"fmt"
	"strings"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

var (
	ErrNoAccount     = errors.New("no account found for this identity")
	ErrNeedsSetup    = errors.New("complete household setup before using SSO")
	ErrLinkedOther   = errors.New("already linked to a different SSO provider")
	ErrUsernameTaken = errors.New("an account with this username already exists and is linked to a different SSO provider")
)

type LinkRequiredError struct {
	MemberID string
	Username string
}

func (e *LinkRequiredError) Error() string { return "link required" }

type Member struct {
	ID              string
	Name            string
	Role            string
	FamilyID        string
	Color           string
	Username        string
	PasswordHash    string
	OAuthProvider   string
	OAuthProviderID string
}

func adultRolesClause() string {
	return `role IN ('admin', 'parent', 'kid')`
}

func GetMemberByOAuthID(database *db.DB, provider, providerID string) (*Member, error) {
	return scanMember(database.QueryRow(`
		SELECT id, name, role, family_id, color, COALESCE(username, ''), COALESCE(password_hash, ''),
		       COALESCE(oauth_provider, ''), COALESCE(oauth_provider_id, '')
		FROM family_members
		WHERE oauth_provider = ? AND oauth_provider_id = ? AND `+adultRolesClause(),
		provider, providerID))
}

func GetMemberByUsername(database *db.DB, username string) (*Member, error) {
	return scanMember(database.QueryRow(`
		SELECT id, name, role, family_id, color, COALESCE(username, ''), COALESCE(password_hash, ''),
		       COALESCE(oauth_provider, ''), COALESCE(oauth_provider_id, '')
		FROM family_members
		WHERE LOWER(username) = LOWER(?) AND `+adultRolesClause(),
		username))
}

func LinkMember(database *db.DB, memberID, provider, providerID string) error {
	_, err := database.Exec(
		`UPDATE family_members SET oauth_provider = ?, oauth_provider_id = ? WHERE id = ?`,
		provider, providerID, memberID,
	)
	return err
}

func CreateOAuthMember(database *db.DB, familyID string, user NormalizedUser, provider, providerID string) (*Member, error) {
	id := uuid.New().String()
	name := user.DisplayName
	if name == "" {
		name = user.Username
	}
	color := "#89b4fa"
	_, err := database.Exec(
		`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash, oauth_provider, oauth_provider_id)
		 VALUES (?, ?, 'parent', ?, ?, ?, '', ?, ?)`,
		id, name, color, familyID, user.Username, provider, providerID,
	)
	if err != nil {
		return nil, err
	}
	return &Member{
		ID:              id,
		Name:            name,
		Role:            "parent",
		FamilyID:        familyID,
		Color:           color,
		Username:        user.Username,
		OAuthProvider:   provider,
		OAuthProviderID: providerID,
	}, nil
}

func FirstFamilyID(database *db.DB) (string, error) {
	var id string
	err := database.QueryRow(`SELECT id FROM families LIMIT 1`).Scan(&id)
	if err == sql.ErrNoRows {
		return "", ErrNeedsSetup
	}
	return id, err
}

func ResolveUser(database *db.DB, providerName string, user NormalizedUser, autoRegister bool) (*Member, bool, error) {
	existing, err := GetMemberByOAuthID(database, providerName, user.ID)
	if err != nil {
		return nil, false, err
	}
	if existing != nil {
		return existing, false, nil
	}

	byUsername, err := GetMemberByUsername(database, user.Username)
	if err != nil {
		return nil, false, err
	}
	if byUsername != nil {
		if byUsername.PasswordHash != "" {
			return nil, false, &LinkRequiredError{MemberID: byUsername.ID, Username: byUsername.Username}
		}
		if byUsername.OAuthProvider != "" && byUsername.OAuthProvider != providerName {
			return nil, false, fmt.Errorf("%w (%s)", ErrUsernameTaken, byUsername.OAuthProvider)
		}
		if err := LinkMember(database, byUsername.ID, providerName, user.ID); err != nil {
			return nil, false, err
		}
		byUsername.OAuthProvider = providerName
		byUsername.OAuthProviderID = user.ID
		return byUsername, false, nil
	}

	if !autoRegister {
		return nil, false, ErrNoAccount
	}

	familyID, err := FirstFamilyID(database)
	if err != nil {
		return nil, false, err
	}

	created, err := CreateOAuthMember(database, familyID, user, providerName, user.ID)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			return nil, false, ErrUsernameTaken
		}
		return nil, false, err
	}
	return created, true, nil
}

func scanMember(row *sql.Row) (*Member, error) {
	var m Member
	err := row.Scan(&m.ID, &m.Name, &m.Role, &m.FamilyID, &m.Color, &m.Username, &m.PasswordHash, &m.OAuthProvider, &m.OAuthProviderID)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &m, nil
}
