package oauth

import (
	"fmt"
	"strings"
)

type NormalizedUser struct {
	ID          string
	Username    string
	Email       string
	DisplayName string
	Groups      []string
}

func SanitizeUsername(raw string) string {
	var b strings.Builder
	b.Grow(len(raw))
	for _, r := range raw {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-' {
			b.WriteRune(r)
			continue
		}
		b.WriteByte('_')
	}
	sanitized := strings.Trim(b.String(), "_")
	for strings.Contains(sanitized, "__") {
		sanitized = strings.ReplaceAll(sanitized, "__", "_")
	}
	if len(sanitized) < 3 {
		sanitized = sanitized + strings.Repeat("_", 3-len(sanitized))
	}
	return sanitized
}

func NormalizeUser(providerType string, userInfo, idTokenClaims map[string]any) (NormalizedUser, error) {
	claims := map[string]any{}
	for k, v := range idTokenClaims {
		claims[k] = v
	}
	for k, v := range userInfo {
		claims[k] = v
	}

	id := claimString(claims["sub"])
	if id == "" {
		if providerType == "authentik" {
			return NormalizedUser{}, fmt.Errorf("Authentik response missing 'sub' claim")
		}
		return NormalizedUser{}, fmt.Errorf("OIDC response missing 'sub' claim")
	}

	email := claimString(claims["email"])
	username := claimString(claims["preferred_username"])
	if username == "" && email != "" {
		username, _, _ = strings.Cut(email, "@")
	}
	if username == "" {
		prefix := "oidc_"
		if providerType == "authentik" {
			prefix = "authentik_"
		}
		end := 8
		if len(id) < end {
			end = len(id)
		}
		username = prefix + id[:end]
	}

	groups := claimStrings(claims["groups"])
	return NormalizedUser{
		ID:          id,
		Username:    SanitizeUsername(username),
		Email:       email,
		DisplayName: claimString(claims["name"]),
		Groups:      groups,
	}, nil
}

func claimString(v any) string {
	s, _ := v.(string)
	return s
}

func claimStrings(v any) []string {
	switch items := v.(type) {
	case []string:
		return items
	case []any:
		out := make([]string, 0, len(items))
		for _, item := range items {
			if s, ok := item.(string); ok {
				out = append(out, s)
			}
		}
		return out
	default:
		return nil
	}
}

func DefaultDisplayName(providerType, displayName string) string {
	if strings.TrimSpace(displayName) != "" {
		return displayName
	}
	if providerType == "authentik" {
		return "Authentik"
	}
	return "SSO"
}
