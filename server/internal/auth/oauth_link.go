package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

const oauthLinkTTL = 5 * time.Minute

type OAuthLinkClaims struct {
	Purpose        string `json:"purpose"`
	ProviderName   string `json:"providerName"`
	OAuthID        string `json:"oauthId"`
	OAuthUsername  string `json:"oauthUsername"`
	TargetMemberID string `json:"targetMemberId"`
	TargetUsername string `json:"targetUsername"`
	Exp            int64  `json:"exp"`
}

func SignOAuthLink(secret string, claims OAuthLinkClaims) (string, error) {
	claims.Purpose = "oauth_link"
	if claims.Exp == 0 {
		claims.Exp = time.Now().Add(oauthLinkTTL).Unix()
	}
	payload, err := json.Marshal(claims)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	return base64.RawURLEncoding.EncodeToString(payload) + "." + base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func VerifyOAuthLink(secret, token string) (*OAuthLinkClaims, error) {
	payloadB64, sigB64, ok := strings.Cut(token, ".")
	if !ok {
		return nil, fmt.Errorf("invalid linking session")
	}
	payload, err := base64.RawURLEncoding.DecodeString(payloadB64)
	if err != nil {
		return nil, fmt.Errorf("invalid linking session")
	}
	sig, err := base64.RawURLEncoding.DecodeString(sigB64)
	if err != nil {
		return nil, fmt.Errorf("invalid linking session")
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	if !hmac.Equal(sig, mac.Sum(nil)) {
		return nil, fmt.Errorf("invalid linking session")
	}
	var claims OAuthLinkClaims
	if err := json.Unmarshal(payload, &claims); err != nil {
		return nil, fmt.Errorf("invalid linking session")
	}
	if claims.Purpose != "oauth_link" {
		return nil, fmt.Errorf("invalid linking session")
	}
	if time.Now().Unix() > claims.Exp {
		return nil, fmt.Errorf("this linking session has expired. Please try signing in with SSO again")
	}
	return &claims, nil
}
