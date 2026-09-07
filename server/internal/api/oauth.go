package api

import (
	"errors"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/oauth"
	"github.com/sandershome/server/internal/service"
)

type OAuthHandler struct {
	db       *db.DB
	cfg      *config.Config
	vikunja  *service.VikunjaService
	registry *oauth.Registry
}

func NewOAuthHandler(database *db.DB, cfg *config.Config, vikunja *service.VikunjaService, registry *oauth.Registry) *OAuthHandler {
	return &OAuthHandler{db: database, cfg: cfg, vikunja: vikunja, registry: registry}
}

func publicOrigin(r *http.Request) string {
	proto := r.Header.Get("X-Forwarded-Proto")
	if proto == "" {
		if r.TLS != nil {
			proto = "https"
		} else {
			proto = "http"
		}
	}
	host := r.Header.Get("X-Forwarded-Host")
	if host == "" {
		host = r.Host
	}
	return proto + "://" + host
}

func (h *OAuthHandler) Providers(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"providers":       h.registry.PublicList(),
		"allowLocalLogin": h.registry.AllowLocalLogin(),
	})
}

func (h *OAuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if !h.registry.Enabled() {
		writeError(w, http.StatusBadRequest, "No OAuth providers are configured")
		return
	}
	providerName := r.URL.Query().Get("provider")
	if providerName == "" {
		writeError(w, http.StatusBadRequest, "Provider parameter is required")
		return
	}
	provider := h.registry.Get(providerName)
	if provider == nil {
		writeError(w, http.StatusBadRequest, "OAuth provider '"+providerName+"' is not configured")
		return
	}

	verifier, challenge, err := oauth.GeneratePKCE()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start sign-in")
		return
	}
	state, err := oauth.RandomHex(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start sign-in")
		return
	}
	nonce, err := oauth.RandomHex(32)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start sign-in")
		return
	}

	callbackURL := publicOrigin(r) + "/api/auth/oauth/callback"
	oauth.CleanExpiredStates(h.db)
	if err := oauth.CreateState(h.db, state, verifier, nonce, callbackURL, providerName); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start sign-in")
		return
	}

	authURL, err := provider.AuthorizationURL(r.Context(), state, challenge, nonce, callbackURL)
	if err != nil {
		log.Printf("OAuth authorization URL: %v", err)
		writeError(w, http.StatusBadGateway, "Sign-in service is currently unavailable. Please try again later.")
		return
	}
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (h *OAuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	origin := publicOrigin(r)
	completeURL := origin + "/auth/oauth/complete"
	redirectError := func(msg string) {
		http.Redirect(w, r, completeURL+"?error="+url.QueryEscape(msg), http.StatusFound)
	}

	oauthError := r.URL.Query().Get("error")
	if oauthError != "" {
		msg := r.URL.Query().Get("error_description")
		if msg == "" {
			msg = oauthError
		}
		switch oauthError {
		case "access_denied":
			msg = "Sign-in was cancelled."
		case "unauthorized_client":
			msg = "Sign-in service configuration error. Please contact your administrator."
		case "server_error", "temporarily_unavailable":
			msg = "Sign-in service is temporarily unavailable. Please try again later."
		}
		log.Printf("OAuth callback error: %s - %s", oauthError, msg)
		redirectError(msg)
		return
	}

	code := r.URL.Query().Get("code")
	state := r.URL.Query().Get("state")
	if code == "" || state == "" {
		redirectError("Missing authorization code or state parameter")
		return
	}

	stored, err := oauth.ConsumeState(h.db, state)
	if err != nil || stored == nil {
		redirectError("Invalid or expired login session. Please try again.")
		return
	}

	provider := h.registry.Get(stored.ProviderName)
	if provider == nil {
		redirectError("OAuth provider not available")
		return
	}

	redirectURI := stored.RedirectURI
	if redirectURI == "" {
		redirectURI = origin + "/api/auth/oauth/callback"
	}

	normalized, err := provider.Exchange(r.Context(), code, stored.CodeVerifier, stored.Nonce, redirectURI)
	if err != nil {
		raw := err.Error()
		log.Printf("OAuth callback failed: %s", raw)
		userMessage := "Authentication failed. Please try again or contact your administrator."
		switch {
		case strings.Contains(raw, "Token exchange failed"):
			userMessage = "Unable to complete sign-in. The sign-in service may be experiencing issues. Please try again."
		case strings.Contains(raw, "ID token validation failed"):
			userMessage = "Sign-in verification failed. Please try again or contact your administrator."
		case strings.Contains(raw, "SSO provider unavailable"):
			userMessage = "Sign-in service is currently unavailable. Please try again later."
		}
		redirectError(userMessage)
		return
	}

	if auth.NeedsSetup(h.db) {
		redirectError("Complete household setup before using SSO.")
		return
	}

	member, created, err := oauth.ResolveUser(h.db, stored.ProviderName, normalized, provider.AutoRegister())
	if err != nil {
		var linkErr *oauth.LinkRequiredError
		if errors.As(err, &linkErr) {
			token, signErr := auth.SignOAuthLink(h.cfg.SessionSecret, auth.OAuthLinkClaims{
				ProviderName:   stored.ProviderName,
				OAuthID:        normalized.ID,
				OAuthUsername:  normalized.Username,
				TargetMemberID: linkErr.MemberID,
				TargetUsername: linkErr.Username,
			})
			if signErr != nil {
				redirectError("Authentication failed. Please try again or contact your administrator.")
				return
			}
			params := url.Values{
				"linkRequired": {"true"},
				"linkToken":    {token},
				"username":     {linkErr.Username},
			}
			http.Redirect(w, r, completeURL+"?"+params.Encode(), http.StatusFound)
			return
		}
		raw := err.Error()
		log.Printf("OAuth resolve failed: %s", raw)
		switch {
		case errors.Is(err, oauth.ErrNoAccount):
			redirectError("No account found for this identity. Please contact your administrator to create an account.")
		case errors.Is(err, oauth.ErrNeedsSetup):
			redirectError("Complete household setup before using SSO.")
		case errors.Is(err, oauth.ErrUsernameTaken), errors.Is(err, oauth.ErrLinkedOther):
			redirectError(raw)
		default:
			redirectError("Authentication failed. Please try again or contact your administrator.")
		}
		return
	}

	if created {
		ensureVikunjaProject(r.Context(), h.db, h.vikunja, member.ID, member.Name, member.Role)
	}

	if err := h.issueSession(w, r, member.ID); err != nil {
		redirectError("Authentication failed. Please try again or contact your administrator.")
		return
	}
	http.Redirect(w, r, completeURL, http.StatusFound)
}

func (h *OAuthHandler) Link(w http.ResponseWriter, r *http.Request) {
	var req struct {
		LinkToken string `json:"linkToken"`
		Password  string `json:"password"`
	}
	if err := readJSON(r, &req); err != nil || req.LinkToken == "" || req.Password == "" {
		writeError(w, http.StatusBadRequest, "Link token and password are required")
		return
	}

	claims, err := auth.VerifyOAuthLink(h.cfg.SessionSecret, req.LinkToken)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	member, err := oauth.GetMemberByUsername(h.db, claims.TargetUsername)
	if err != nil || member == nil || member.ID != claims.TargetMemberID {
		writeError(w, http.StatusBadRequest, "User account not found")
		return
	}
	if member.PasswordHash == "" {
		writeError(w, http.StatusBadRequest, "Account cannot be linked: no password is set")
		return
	}
	if !auth.CheckPassword(member.PasswordHash, req.Password) {
		writeError(w, http.StatusUnauthorized, "Incorrect password")
		return
	}

	if err := oauth.LinkMember(h.db, member.ID, claims.ProviderName, claims.OAuthID); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to link account")
		return
	}
	if err := h.issueSession(w, r, member.ID); err != nil {
		writeError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"memberId":    member.ID,
		"name":        member.Name,
		"role":        member.Role,
		"familyId":    member.FamilyID,
		"color":       member.Color,
		"username":    member.Username,
		"permissions": auth.ResolvePermissions(member.Role, nil),
	})
}

func (h *OAuthHandler) issueSession(w http.ResponseWriter, r *http.Request, memberID string) error {
	token, err := auth.CreateSession(h.db, h.cfg.SessionSecret, memberID, "user")
	if err != nil {
		return err
	}
	setSessionCookie(w, r, token, 30*24*time.Hour)
	return nil
}
