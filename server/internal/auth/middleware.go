package auth

import (
	"encoding/json"
	"net/http"

	"github.com/sandershome/server/internal/db"
)

func AuthMiddleware(database *db.DB, secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session")
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "authentication required")
				return
			}

			user, err := ValidateSession(database, secret, cookie.Value)
			if err != nil {
				writeAuthError(w, http.StatusUnauthorized, "invalid session")
				return
			}

			ctx := WithUser(r.Context(), user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

func OptionalAuth(database *db.DB, secret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session")
			if err == nil {
				user, err := ValidateSession(database, secret, cookie.Value)
				if err == nil {
					ctx := WithUser(r.Context(), user)
					r = r.WithContext(ctx)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func RequirePermission(perm string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if !HasPermission(user, perm) {
				writeAuthError(w, http.StatusForbidden, "insufficient permissions")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func writeAuthError(w http.ResponseWriter, status int, msg string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{"error": msg})
}
