package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/oauth"
)

func setupOAuthAPI(t *testing.T, cfg *config.Config) (*db.DB, http.Handler, *oauth.Registry) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	if cfg == nil {
		cfg = &config.Config{SessionSecret: "test-secret", OAuthAllowLocalLogin: true}
	}
	reg := oauth.NewRegistry(database, cfg)
	reg.Load()
	h := NewOAuthHandler(database, cfg, nil, reg)
	admin := NewOAuthAdminHandler(database, reg)
	user := &auth.UserInfo{MemberID: "m1", FamilyID: "f1", Role: "admin"}

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.Header.Get("X-Test-User") == "1" {
				req = req.WithContext(auth.WithUser(req.Context(), user))
			}
			next.ServeHTTP(w, req)
		})
	})
	r.Get("/api/auth/oauth/providers", h.Providers)
	r.Get("/api/auth/oauth/login", h.Login)
	r.Post("/api/auth/oauth/link", h.Link)
	r.Get("/api/admin/oauth-providers", admin.List)
	r.Post("/api/admin/oauth-providers", admin.Create)
	r.Put("/api/admin/oauth-providers/{id}", admin.Update)
	r.Delete("/api/admin/oauth-providers/{id}", admin.Delete)
	return database, r, reg
}

func TestOAuthProvidersEmpty(t *testing.T) {
	_, router, _ := setupOAuthAPI(t, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/oauth/providers", nil))
	if w.Code != http.StatusOK {
		t.Fatalf("status %d body %s", w.Code, w.Body.String())
	}
	var body struct {
		Providers       []oauth.PublicProvider `json:"providers"`
		AllowLocalLogin bool                   `json:"allowLocalLogin"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if len(body.Providers) != 0 || !body.AllowLocalLogin {
		t.Fatalf("%+v", body)
	}
}

func TestOAuthProvidersFromEnv(t *testing.T) {
	cfg := &config.Config{
		SessionSecret:        "test-secret",
		OAuthAllowLocalLogin: false,
		OAuthProvider:        "authentik",
		OAuthClientID:        "cid",
		OAuthClientSecret:    "csecret",
		OAuthIssuerURL:       "https://auth.example.com/application/o/famos/",
		OAuthScopes:          "openid,profile,email",
		OAuthAutoRegister:    true,
	}
	_, router, _ := setupOAuthAPI(t, cfg)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/oauth/providers", nil))
	var body struct {
		Providers       []oauth.PublicProvider `json:"providers"`
		AllowLocalLogin bool                   `json:"allowLocalLogin"`
	}
	json.Unmarshal(w.Body.Bytes(), &body)
	if len(body.Providers) != 1 || body.Providers[0].Name != "authentik" || body.Providers[0].DisplayName != "Authentik" {
		t.Fatalf("%+v", body)
	}
	if body.AllowLocalLogin {
		t.Fatal("expected local login disabled")
	}
}

func TestOAuthAdminOmitsSecret(t *testing.T) {
	_, router, _ := setupOAuthAPI(t, nil)
	w := doJSON(t, router, "POST", "/api/admin/oauth-providers", map[string]any{
		"name":         "authentik",
		"displayName":  "Company SSO",
		"providerType": "authentik",
		"clientId":     "cid",
		"clientSecret": "super-secret",
		"issuerUrl":    "https://auth.example.com/application/o/famos/",
		"scopes":       "openid,profile,email",
		"autoRegister": true,
		"enabled":      true,
	}, true)
	if w.Code != http.StatusCreated {
		t.Fatalf("create %d %s", w.Code, w.Body.String())
	}
	var created map[string]any
	json.Unmarshal(w.Body.Bytes(), &created)
	if _, ok := created["clientSecret"]; ok {
		t.Fatal("clientSecret must be omitted")
	}
	if created["hasClientSecret"] != true {
		t.Fatalf("hasClientSecret %+v", created["hasClientSecret"])
	}

	list := doJSON(t, router, "GET", "/api/admin/oauth-providers", nil, true)
	var providers []map[string]any
	json.Unmarshal(list.Body.Bytes(), &providers)
	if len(providers) != 1 {
		t.Fatalf("list %s", list.Body.String())
	}
	if _, ok := providers[0]["clientSecret"]; ok {
		t.Fatal("list leaked clientSecret")
	}
}

func TestOAuthLoginRequiresProvider(t *testing.T) {
	_, router, _ := setupOAuthAPI(t, nil)
	w := httptest.NewRecorder()
	router.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/api/auth/oauth/login", nil))
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status %d", w.Code)
	}
}

func TestOAuthLinkToken(t *testing.T) {
	token, err := auth.SignOAuthLink("secret", auth.OAuthLinkClaims{
		ProviderName:   "authentik",
		OAuthID:        "sub",
		OAuthUsername:  "greg",
		TargetMemberID: "m1",
		TargetUsername: "greg",
	})
	if err != nil {
		t.Fatal(err)
	}
	claims, err := auth.VerifyOAuthLink("secret", token)
	if err != nil || claims.TargetMemberID != "m1" {
		t.Fatalf("%v %+v", err, claims)
	}
	if _, err := auth.VerifyOAuthLink("other", token); err == nil {
		t.Fatal("expected invalid signature")
	}
}
