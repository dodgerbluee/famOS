package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/config"
	"github.com/sandershome/server/internal/db"
)

func setupKioskHandler(t *testing.T) (*db.DB, http.Handler) {
	t.Helper()
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, username, password_hash) VALUES (?, 'Greg', 'admin', '#89b4fa', ?, 'greg', 'hash')`, memberID, familyID)

	h := NewKioskHandler(database, &config.Config{SessionSecret: "test-secret"})
	user := &auth.UserInfo{MemberID: memberID, FamilyID: familyID, Name: "Greg", Role: "admin"}

	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			if req.Header.Get("X-Test-User") == "1" {
				req = req.WithContext(auth.WithUser(req.Context(), user))
			}
			next.ServeHTTP(w, req)
		})
	})
	r.Post("/api/kiosks", h.Create)
	r.Get("/api/kiosks", h.List)
	r.Post("/api/kiosks/{id}/pairing", h.CreatePairing)
	r.Post("/api/kiosks/{id}/logout", h.Logout)
	r.Delete("/api/kiosks/{id}", h.Delete)
	r.Post("/api/kiosks/pending", h.StartPending)
	r.Get("/api/kiosks/pending/{token}", h.PendingStatus)
	r.Post("/api/kiosks/approve", h.Approve)
	r.Post("/api/kiosks/claim", h.Claim)

	return database, r
}

func doJSON(t *testing.T, handler http.Handler, method, path string, body any, asUser bool) *httptest.ResponseRecorder {
	t.Helper()
	var r *http.Request
	if body != nil {
		b, _ := json.Marshal(body)
		r = httptest.NewRequest(method, path, bytes.NewReader(b))
		r.Header.Set("Content-Type", "application/json")
	} else {
		r = httptest.NewRequest(method, path, nil)
	}
	if asUser {
		r.Header.Set("X-Test-User", "1")
	}
	w := httptest.NewRecorder()
	handler.ServeHTTP(w, r)
	return w
}

func TestKioskCreateAndClaim(t *testing.T) {
	database, router := setupKioskHandler(t)

	w := doJSON(t, router, "POST", "/api/kiosks", map[string]string{"name": "Kitchen"}, true)
	if w.Code != http.StatusCreated {
		t.Fatalf("create: got %d %s", w.Code, w.Body.String())
	}
	var created kioskResponse
	json.Unmarshal(w.Body.Bytes(), &created)
	if created.ID == "" || created.PairingToken == "" {
		t.Fatalf("expected id and pairing token, got %+v", created)
	}

	w = doJSON(t, router, "POST", "/api/kiosks/claim", map[string]string{"token": created.PairingToken}, false)
	if w.Code != http.StatusOK {
		t.Fatalf("claim: got %d %s", w.Code, w.Body.String())
	}
	cookie := w.Result().Cookies()
	if len(cookie) == 0 || cookie[0].Name != "session" {
		t.Fatal("expected session cookie")
	}

	info, err := auth.ValidateSession(database, "test-secret", cookie[0].Value)
	if err != nil {
		t.Fatalf("validate session: %v", err)
	}
	if info.Role != "kiosk" || info.SessionType != "kiosk" {
		t.Fatalf("expected kiosk session, got role=%s type=%s", info.Role, info.SessionType)
	}

	w = doJSON(t, router, "POST", "/api/kiosks/claim", map[string]string{"token": created.PairingToken}, false)
	if w.Code != http.StatusNotFound && w.Code != http.StatusConflict && w.Code != http.StatusBadRequest {
		t.Fatalf("second claim should fail, got %d", w.Code)
	}

	w = doJSON(t, router, "GET", "/api/kiosks", nil, true)
	if w.Code != http.StatusOK {
		t.Fatalf("list: got %d %s", w.Code, w.Body.String())
	}
	var listed []kioskResponse
	json.Unmarshal(w.Body.Bytes(), &listed)
	if len(listed) != 1 || !listed[0].Paired || listed[0].Name != "Kitchen" {
		t.Fatalf("expected one paired kitchen kiosk, got %+v", listed)
	}

	w = doJSON(t, router, "POST", "/api/kiosks/"+created.ID+"/logout", nil, true)
	if w.Code != http.StatusOK {
		t.Fatalf("logout: got %d %s", w.Code, w.Body.String())
	}
	if _, err := auth.ValidateSession(database, "test-secret", cookie[0].Value); err == nil {
		t.Fatal("expected revoked session to fail")
	}
}

func TestKioskPendingApproveClaim(t *testing.T) {
	database, router := setupKioskHandler(t)

	w := doJSON(t, router, "POST", "/api/kiosks/pending", map[string]any{}, false)
	if w.Code != http.StatusOK {
		t.Fatalf("pending: got %d %s", w.Code, w.Body.String())
	}
	var pending struct {
		Token      string `json:"token"`
		PollSecret string `json:"pollSecret"`
	}
	json.Unmarshal(w.Body.Bytes(), &pending)

	w = doJSON(t, router, "GET", "/api/kiosks/pending/"+pending.Token+"?secret="+pending.PollSecret, nil, false)
	if w.Code != http.StatusOK {
		t.Fatalf("status: got %d %s", w.Code, w.Body.String())
	}
	var status map[string]string
	json.Unmarshal(w.Body.Bytes(), &status)
	if status["status"] != "pending" {
		t.Fatalf("expected pending, got %v", status)
	}

	w = doJSON(t, router, "POST", "/api/kiosks/approve", map[string]string{"token": pending.Token, "name": "Playroom"}, true)
	if w.Code != http.StatusOK {
		t.Fatalf("approve: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(t, router, "GET", "/api/kiosks/pending/"+pending.Token+"?secret="+pending.PollSecret, nil, false)
	json.Unmarshal(w.Body.Bytes(), &status)
	if status["status"] != "approved" || status["claimToken"] == "" {
		t.Fatalf("expected approved with claim token, got %v", status)
	}

	w = doJSON(t, router, "POST", "/api/kiosks/claim", map[string]string{"claimToken": status["claimToken"]}, false)
	if w.Code != http.StatusOK {
		t.Fatalf("claim: got %d %s", w.Code, w.Body.String())
	}

	cookie := w.Result().Cookies()
	info, err := auth.ValidateSession(database, "test-secret", cookie[0].Value)
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if info.Name != "Playroom" || info.Role != "kiosk" {
		t.Fatalf("unexpected kiosk: %+v", info)
	}

	var people int
	database.QueryRow(`SELECT COUNT(*) FROM family_members WHERE role != 'kiosk'`).Scan(&people)
	if people != 1 {
		t.Fatalf("kiosk should not appear as a person, people=%d", people)
	}
}

func TestFamilyCreateAdultRequiresLogin(t *testing.T) {
	database, err := db.New(":memory:")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { database.Close() })
	if err := database.Migrate(); err != nil {
		t.Fatal(err)
	}

	familyID := uuid.New().String()
	memberID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Greg', 'admin', '#89b4fa', ?)`, memberID, familyID)
	user := &auth.UserInfo{MemberID: memberID, FamilyID: familyID, Name: "Greg", Role: "admin"}

	fh := &FamilyHandler{db: database}
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(auth.WithUser(req.Context(), user)))
		})
	})
	r.Post("/api/family", fh.Create)

	w := doJSON(t, r, "POST", "/api/family", map[string]string{"name": "Sam", "role": "parent", "color": "#a6e3a1"}, false)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 without credentials, got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(t, r, "POST", "/api/family", map[string]string{
		"name": "Sam", "role": "parent", "color": "#a6e3a1", "username": "sam", "password": "secret1",
	}, false)
	if w.Code != http.StatusCreated {
		t.Fatalf("create parent: got %d %s", w.Code, w.Body.String())
	}

	w = doJSON(t, r, "POST", "/api/family", map[string]string{
		"name": "Nora", "role": "kid", "color": "#f38ba8",
	}, false)
	if w.Code != http.StatusCreated {
		t.Fatalf("create kid: got %d %s", w.Code, w.Body.String())
	}
}
