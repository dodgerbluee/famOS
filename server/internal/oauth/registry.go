package oauth

import (
	"fmt"
	"log"
	"net/url"
	"strings"
	"sync"

	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

var supportedTypes = map[string]bool{
	"authentik":    true,
	"generic_oidc": true,
}

type PublicProvider struct {
	Name        string `json:"name"`
	DisplayName string `json:"displayName"`
}

type Registry struct {
	db  *db.DB
	cfg *config.Config

	mu        sync.RWMutex
	providers map[string]*Provider
}

func NewRegistry(database *db.DB, cfg *config.Config) *Registry {
	return &Registry{
		db:        database,
		cfg:       cfg,
		providers: map[string]*Provider{},
	}
}

func (r *Registry) Load() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.providers = map[string]*Provider{}
	r.loadFromDB()
	r.loadFromEnv()
	if len(r.providers) == 0 {
		log.Println("No OAuth providers configured")
	}
}

func (r *Registry) Reload() {
	r.Load()
}

func (r *Registry) Get(name string) *Provider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.providers[name]
}

func (r *Registry) Enabled() bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.providers) > 0
}

func (r *Registry) PublicList() []PublicProvider {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]PublicProvider, 0, len(r.providers))
	for _, p := range r.providers {
		out = append(out, PublicProvider{Name: p.Name(), DisplayName: p.DisplayName()})
	}
	return out
}

func (r *Registry) AllowLocalLogin() bool {
	if r.cfg == nil {
		return true
	}
	return r.cfg.OAuthAllowLocalLogin
}

func (r *Registry) loadFromDB() {
	if r.db == nil {
		return
	}
	rows, err := r.db.Query(`
		SELECT name, display_name, provider_type, client_id, client_secret, issuer_url, scopes, auto_register
		FROM oauth_providers WHERE enabled = 1`)
	if err != nil {
		log.Printf("Could not load OAuth providers from DB, falling back to env: %v", err)
		return
	}
	defer rows.Close()

	for rows.Next() {
		var name, displayName, providerType, clientID, clientSecret, issuerURL, scopes string
		var autoRegister bool
		if err := rows.Scan(&name, &displayName, &providerType, &clientID, &clientSecret, &issuerURL, &scopes, &autoRegister); err != nil {
			continue
		}
		p, err := providerFromFields(name, displayName, providerType, clientID, clientSecret, issuerURL, scopes, autoRegister)
		if err != nil {
			log.Printf("OAuth provider '%s': %v, skipping", name, err)
			continue
		}
		r.providers[p.Name()] = p
		log.Printf("Registered OAuth provider: %s (%s)", p.Name(), p.DisplayName())
	}
}

func (r *Registry) loadFromEnv() {
	if r.cfg == nil {
		return
	}
	providerType := r.cfg.OAuthProvider
	if providerType == "" {
		return
	}
	if _, exists := r.providers[providerType]; exists {
		return
	}
	p, err := providerFromFields(
		providerType,
		r.cfg.OAuthDisplayName,
		providerType,
		r.cfg.OAuthClientID,
		r.cfg.OAuthClientSecret,
		r.cfg.OAuthIssuerURL,
		r.cfg.OAuthScopes,
		r.cfg.OAuthAutoRegister,
	)
	if err != nil {
		log.Printf("env-var OAuth: %v", err)
		return
	}
	r.providers[p.Name()] = p
	log.Printf("Registered OAuth provider from env: %s (%s)", p.Name(), p.DisplayName())
}

func providerFromFields(name, displayName, providerType, clientID, clientSecret, issuerURL, scopes string, autoRegister bool) (*Provider, error) {
	name = strings.TrimSpace(name)
	providerType = strings.ToLower(strings.TrimSpace(providerType))
	clientID = strings.TrimSpace(clientID)
	issuerURL = strings.TrimSpace(issuerURL)
	if name == "" || clientID == "" || clientSecret == "" || issuerURL == "" {
		return nil, fmt.Errorf("missing required fields")
	}
	if !supportedTypes[providerType] {
		return nil, fmt.Errorf("unsupported type '%s' (use authentik or generic_oidc)", providerType)
	}
	if _, err := url.ParseRequestURI(issuerURL); err != nil {
		return nil, fmt.Errorf("invalid issuer URL")
	}
	return NewProvider(ProviderConfig{
		Name:         name,
		DisplayName:  displayName,
		ProviderType: providerType,
		ClientID:     clientID,
		ClientSecret: clientSecret,
		IssuerURL:    issuerURL,
		Scopes:       splitScopes(scopes),
		AutoRegister: autoRegister,
	}), nil
}

func splitScopes(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{"openid", "profile", "email"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if s := strings.TrimSpace(p); s != "" {
			out = append(out, s)
		}
	}
	return out
}

func SupportedType(providerType string) bool {
	return supportedTypes[strings.ToLower(strings.TrimSpace(providerType))]
}
