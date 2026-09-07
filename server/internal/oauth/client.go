package oauth

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"golang.org/x/oauth2"
)

type ProviderConfig struct {
	Name         string
	DisplayName  string
	ProviderType string
	ClientID     string
	ClientSecret string
	IssuerURL    string
	Scopes       []string
	AutoRegister bool
}

type Provider struct {
	cfg ProviderConfig

	mu       sync.Mutex
	oidcProv *oidc.Provider
}

func NewProvider(cfg ProviderConfig) *Provider {
	if len(cfg.Scopes) == 0 {
		cfg.Scopes = []string{"openid", "profile", "email"}
	}
	cfg.DisplayName = DefaultDisplayName(cfg.ProviderType, cfg.DisplayName)
	return &Provider{cfg: cfg}
}

func (p *Provider) Name() string         { return p.cfg.Name }
func (p *Provider) DisplayName() string  { return p.cfg.DisplayName }
func (p *Provider) Type() string         { return p.cfg.ProviderType }
func (p *Provider) AutoRegister() bool   { return p.cfg.AutoRegister }
func (p *Provider) IssuerURL() string    { return p.cfg.IssuerURL }
func (p *Provider) ClientID() string     { return p.cfg.ClientID }

func (p *Provider) getOIDC(ctx context.Context) (*oidc.Provider, error) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.oidcProv != nil {
		return p.oidcProv, nil
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	prov, err := oidc.NewProvider(ctx, p.cfg.IssuerURL)
	if err != nil {
		return nil, fmt.Errorf("SSO provider unavailable: %w", err)
	}
	p.oidcProv = prov
	return prov, nil
}

func (p *Provider) oauth2Config(oidcProv *oidc.Provider, redirectURI string) *oauth2.Config {
	return &oauth2.Config{
		ClientID:     p.cfg.ClientID,
		ClientSecret: p.cfg.ClientSecret,
		Endpoint:     oidcProv.Endpoint(),
		RedirectURL:  redirectURI,
		Scopes:       p.cfg.Scopes,
	}
}

func (p *Provider) AuthorizationURL(ctx context.Context, state, codeChallenge, nonce, redirectURI string) (string, error) {
	oidcProv, err := p.getOIDC(ctx)
	if err != nil {
		return "", err
	}
	cfg := p.oauth2Config(oidcProv, redirectURI)
	return cfg.AuthCodeURL(state,
		oauth2.SetAuthURLParam("code_challenge", codeChallenge),
		oauth2.SetAuthURLParam("code_challenge_method", "S256"),
		oauth2.SetAuthURLParam("nonce", nonce),
	), nil
}

func (p *Provider) Exchange(ctx context.Context, code, codeVerifier, nonce, redirectURI string) (NormalizedUser, error) {
	oidcProv, err := p.getOIDC(ctx)
	if err != nil {
		return NormalizedUser{}, err
	}

	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	cfg := p.oauth2Config(oidcProv, redirectURI)
	token, err := cfg.Exchange(ctx, code, oauth2.SetAuthURLParam("code_verifier", codeVerifier))
	if err != nil {
		return NormalizedUser{}, fmt.Errorf("Token exchange failed: %w", err)
	}
	if token.AccessToken == "" {
		return NormalizedUser{}, fmt.Errorf("Failed to obtain access token from provider")
	}

	idClaims := map[string]any{}
	if rawIDToken, ok := token.Extra("id_token").(string); ok && rawIDToken != "" {
		verifier := oidcProv.Verifier(&oidc.Config{ClientID: p.cfg.ClientID})
		idToken, err := verifier.Verify(ctx, rawIDToken)
		if err != nil {
			return NormalizedUser{}, fmt.Errorf("ID token validation failed: %w", err)
		}
		if idToken.Nonce != nonce {
			return NormalizedUser{}, fmt.Errorf("ID token validation failed: nonce mismatch")
		}
		if err := idToken.Claims(&idClaims); err != nil {
			return NormalizedUser{}, fmt.Errorf("ID token validation failed: %w", err)
		}
	}

	userInfo := map[string]any{}
	info, err := oidcProv.UserInfo(ctx, oauth2.StaticTokenSource(token))
	if err == nil && info != nil {
		_ = info.Claims(&userInfo)
	}

	return NormalizeUser(p.cfg.ProviderType, userInfo, idClaims)
}
