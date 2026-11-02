package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
)

func TestChoreCompletionDeadlineAllowsThreeHoursAfterDueDay(t *testing.T) {
	loc, err := time.LoadLocation("America/Chicago")
	if err != nil {
		t.Fatal(err)
	}
	due := time.Date(2026, time.November, 2, 23, 59, 0, 0, loc)
	got := choreCompletionDeadline(due, loc)
	want := time.Date(2026, time.November, 3, 3, 0, 0, 0, loc)
	if !got.Equal(want) {
		t.Fatalf("deadline = %v, want %v", got, want)
	}
}

func TestKioskCanViewAdultTasksInItsFamily(t *testing.T) {
	router, database := buildTestRouter(t)
	familyID := uuid.New().String()
	kioskID := uuid.New().String()
	adultID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Kitchen', 'kiosk', '#737f91', ?)`, kioskID, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, vikunja_project_id) VALUES (?, 'Parent', 'parent', '#7c83ff', ?, 0)`, adultID, familyID)

	token, err := auth.CreateSession(database, "test-secret", kioskID, "kiosk")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/tasks?memberId="+adultID, nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: token})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("kiosk task request returned %d: %s", rec.Code, rec.Body.String())
	}

	createReq := httptest.NewRequest(http.MethodPost, "/api/tasks", strings.NewReader(`{"title":"Not allowed","memberId":"`+adultID+`"}`))
	createReq.Header.Set("Content-Type", "application/json")
	createReq.AddCookie(&http.Cookie{Name: "session", Value: token})
	createRec := httptest.NewRecorder()
	router.ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusForbidden {
		t.Fatalf("kiosk task creation returned %d, want 403", createRec.Code)
	}
}

func TestTaskMemberMustBelongToSessionFamily(t *testing.T) {
	router, database := buildTestRouter(t)
	familyID := uuid.New().String()
	otherFamilyID := uuid.New().String()
	kioskID := uuid.New().String()
	otherAdultID := uuid.New().String()
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Test')`, familyID)
	database.Exec(`INSERT INTO families (id, name) VALUES (?, 'Other')`, otherFamilyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id) VALUES (?, 'Kitchen', 'kiosk', '#737f91', ?)`, kioskID, familyID)
	database.Exec(`INSERT INTO family_members (id, name, role, color, family_id, vikunja_project_id) VALUES (?, 'Other Parent', 'parent', '#7c83ff', ?, 0)`, otherAdultID, otherFamilyID)

	token, err := auth.CreateSession(database, "test-secret", kioskID, "kiosk")
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodGet, "/api/tasks?memberId="+otherAdultID, nil)
	req.AddCookie(&http.Cookie{Name: "session", Value: token})
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("cross-family task request returned %d, want 404", rec.Code)
	}
}
