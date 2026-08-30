package api

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
	"sync/atomic"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/auth"
	"github.com/sandershome/server/internal/db"
	"github.com/sandershome/server/internal/service"
)

type FamilyHandler struct {
	db             *db.DB
	vikunja        *service.VikunjaService
	choreTemplates *service.ChoreTemplateService
}

type FamilyMember struct {
	ID               string `json:"id"`
	Name             string `json:"name"`
	Role             string `json:"role"`
	AvatarURL        string `json:"avatarUrl"`
	Color            string `json:"color"`
	SortOrder        int    `json:"sortOrder"`
	Birthday         string `json:"birthday"`
	VikunjaProjectID int64  `json:"vikunjaProjectId"`
	CanLogin         bool   `json:"canLogin"`
	Username         string `json:"username,omitempty"`
	CreatedAt        string `json:"createdAt"`
}

type CreateFamilyMemberRequest struct {
	Name     string `json:"name"`
	Role     string `json:"role"`
	Color    string `json:"color"`
	Pin      string `json:"pin,omitempty"`
	Username string `json:"username,omitempty"`
	Password string `json:"password,omitempty"`
}

func (h *FamilyHandler) List(w http.ResponseWriter, r *http.Request) {
	if h.vikunja != nil {
		go backfillVikunjaProjects(context.WithoutCancel(r.Context()), h.db, h.vikunja)
	}

	rows, err := h.db.Query(`SELECT id, name, role, avatar_url, color, sort_order, COALESCE(birthday, ''), COALESCE(vikunja_project_id, 0), CASE WHEN COALESCE(password_hash, '') != '' THEN 1 ELSE 0 END, COALESCE(username, ''), created_at FROM family_members WHERE role != 'kiosk' ORDER BY sort_order, name`)
	if err != nil {
		log.Printf("list family members: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to list family members")
		return
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		var canLogin int
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.Birthday, &m.VikunjaProjectID, &canLogin, &m.Username, &m.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan family member")
			return
		}
		m.CanLogin = canLogin == 1
		members = append(members, m)
	}

	writeJSON(w, http.StatusOK, members)
}

func (h *FamilyHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var m FamilyMember
	var canLogin int
	err := h.db.QueryRow(`SELECT id, name, role, avatar_url, color, sort_order, COALESCE(birthday, ''), COALESCE(vikunja_project_id, 0), CASE WHEN COALESCE(password_hash, '') != '' THEN 1 ELSE 0 END, COALESCE(username, ''), created_at FROM family_members WHERE id = ?`, id).
		Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.Birthday, &m.VikunjaProjectID, &canLogin, &m.Username, &m.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	m.CanLogin = canLogin == 1
	writeJSON(w, http.StatusOK, m)
}

func getOrCreateFamilyProject(ctx context.Context, database *db.DB, vikunja *service.VikunjaService) int64 {
	if vikunja == nil {
		return 0
	}
	var raw string
	err := database.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_family_project_id'`).Scan(&raw)
	if err == nil && raw != "" {
		var id int64
		if json.Unmarshal([]byte(raw), &id) == nil && id > 0 {
			return id
		}
	}

	projectID, err := vikunja.CreateProject(ctx, "Family", 0)
	if err != nil {
		log.Printf("failed to create Vikunja family project: %v", err)
		return 0
	}

	encoded, _ := json.Marshal(projectID)
	database.Exec(`INSERT INTO app_settings (key, value) VALUES ('vikunja_family_project_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, string(encoded))
	return projectID
}

func ensureVikunjaProject(ctx context.Context, database *db.DB, vikunja *service.VikunjaService, memberID, name, role string) {
	if vikunja == nil || role == "kiosk" || memberID == "" || name == "" {
		return
	}

	var projectID int64
	database.QueryRow(`SELECT COALESCE(vikunja_project_id, 0) FROM family_members WHERE id = ?`, memberID).Scan(&projectID)
	if projectID > 0 {
		return
	}

	parentProjectID := getOrCreateFamilyProject(ctx, database, vikunja)
	if parentProjectID == 0 {
		return
	}

	newID, err := vikunja.CreateProject(ctx, name, parentProjectID)
	if err != nil {
		log.Printf("failed to create Vikunja project for member %s: %v", name, err)
		return
	}
	database.Exec(`UPDATE family_members SET vikunja_project_id = ? WHERE id = ?`, newID, memberID)
}

var vikunjaBackfillRunning atomic.Bool

func backfillVikunjaProjects(ctx context.Context, database *db.DB, vikunja *service.VikunjaService) {
	if vikunja == nil || !vikunjaConfigured(database) {
		return
	}
	if !vikunjaBackfillRunning.CompareAndSwap(false, true) {
		return
	}
	defer vikunjaBackfillRunning.Store(false)

	rows, err := database.Query(`SELECT id, name, role FROM family_members WHERE role != 'kiosk' AND COALESCE(vikunja_project_id, 0) = 0`)
	if err != nil {
		return
	}

	type member struct {
		id, name, role string
	}
	var missing []member
	for rows.Next() {
		var m member
		if rows.Scan(&m.id, &m.name, &m.role) == nil {
			missing = append(missing, m)
		}
	}
	rows.Close()

	for _, m := range missing {
		ensureVikunjaProject(ctx, database, vikunja, m.id, m.name, m.role)
	}
}

func vikunjaConfigured(database *db.DB) bool {
	var rawURL, rawKey string
	database.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_url'`).Scan(&rawURL)
	database.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_api_key'`).Scan(&rawKey)
	var url, key string
	json.Unmarshal([]byte(rawURL), &url)
	json.Unmarshal([]byte(rawKey), &key)
	return strings.TrimSpace(url) != "" && strings.TrimSpace(key) != ""
}

func (h *FamilyHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateFamilyMemberRequest
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Name == "" || req.Role == "" || req.Color == "" {
		writeError(w, http.StatusBadRequest, "name, role, and color are required")
		return
	}

	if req.Role != "admin" && req.Role != "parent" && req.Role != "kid" {
		writeError(w, http.StatusBadRequest, "role must be 'admin', 'parent', or 'kid'")
		return
	}

	isAdult := req.Role == "admin" || req.Role == "parent"
	if isAdult {
		req.Username = strings.TrimSpace(req.Username)
		if req.Username == "" || req.Password == "" {
			writeError(w, http.StatusBadRequest, "username and password are required for adult accounts")
			return
		}
		if usernameTaken(h.db, req.Username, "") {
			writeError(w, http.StatusConflict, "username already in use")
			return
		}
	}

	id := uuid.New().String()
	var pinHash string
	if req.Pin != "" {
		var err error
		pinHash, err = auth.HashPin(req.Pin)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash pin")
			return
		}
	}

	var passwordHash string
	if req.Password != "" {
		var err error
		passwordHash, err = auth.HashPassword(req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
	}

	familyID := ""
	if user := auth.UserFromContext(r.Context()); user != nil {
		familyID = user.FamilyID
	} else {
		h.db.QueryRow(`SELECT id FROM families LIMIT 1`).Scan(&familyID)
	}

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO family_members (id, name, role, pin_hash, color, family_id, username, password_hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		id, req.Name, req.Role, pinHash, req.Color, familyID, req.Username, passwordHash)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to create family member")
		return
	}

	if req.Role == "kid" {
		accountID := uuid.New().String()
		_, err = tx.Exec(`INSERT INTO sanders_cash_accounts (id, member_id, balance) VALUES (?, ?, 0)`, accountID, id)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to create sanders cash account")
			return
		}
	}

	if err := tx.Commit(); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to commit")
		return
	}

	ensureVikunjaProject(r.Context(), h.db, h.vikunja, id, req.Name, req.Role)

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (h *FamilyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		AvatarURL *string `json:"avatarUrl"`
		SortOrder *int    `json:"sortOrder"`
		Birthday  *string `json:"birthday"`
		Username  *string `json:"username"`
		Password  *string `json:"password"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	var role string
	err := h.db.QueryRow(`SELECT role FROM family_members WHERE id = ?`, id).Scan(&role)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}

	if req.Name != nil {
		h.db.Exec(`UPDATE family_members SET name = ? WHERE id = ?`, *req.Name, id)
	}
	if req.Color != nil {
		h.db.Exec(`UPDATE family_members SET color = ? WHERE id = ?`, *req.Color, id)
	}
	if req.AvatarURL != nil {
		h.db.Exec(`UPDATE family_members SET avatar_url = ? WHERE id = ?`, *req.AvatarURL, id)
	}
	if req.SortOrder != nil {
		h.db.Exec(`UPDATE family_members SET sort_order = ? WHERE id = ?`, *req.SortOrder, id)
	}
	if req.Birthday != nil {
		h.db.Exec(`UPDATE family_members SET birthday = ? WHERE id = ?`, *req.Birthday, id)
	}
	if req.Username != nil {
		username := strings.TrimSpace(*req.Username)
		if username != "" && usernameTaken(h.db, username, id) {
			writeError(w, http.StatusConflict, "username already in use")
			return
		}
		h.db.Exec(`UPDATE family_members SET username = ? WHERE id = ?`, username, id)
	}
	if req.Password != nil && *req.Password != "" {
		hash, err := auth.HashPassword(*req.Password)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash password")
			return
		}
		h.db.Exec(`UPDATE family_members SET password_hash = ? WHERE id = ?`, hash, id)
	}

	var memberName string
	h.db.QueryRow(`SELECT name FROM family_members WHERE id = ?`, id).Scan(&memberName)

	if h.vikunja != nil && role != "kiosk" {
		var vikunjaProjectID int64
		h.db.QueryRow(`SELECT COALESCE(vikunja_project_id, 0) FROM family_members WHERE id = ?`, id).Scan(&vikunjaProjectID)

		if vikunjaProjectID == 0 {
			ensureVikunjaProject(r.Context(), h.db, h.vikunja, id, memberName, role)
		} else if req.Name != nil {
			if err := h.vikunja.UpdateProject(r.Context(), vikunjaProjectID, *req.Name); err != nil {
				log.Printf("failed to rename Vikunja project %d: %v", vikunjaProjectID, err)
			}
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *FamilyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	if user := auth.UserFromContext(r.Context()); user != nil && user.MemberID == id {
		writeError(w, http.StatusBadRequest, "you cannot remove your own account")
		return
	}

	var role string
	var vikunjaProjectID int64
	err := h.db.QueryRow(`SELECT role, COALESCE(vikunja_project_id, 0) FROM family_members WHERE id = ?`, id).Scan(&role, &vikunjaProjectID)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}

	if role == "admin" {
		var adminCount int
		h.db.QueryRow(`SELECT COUNT(*) FROM family_members WHERE role = 'admin'`).Scan(&adminCount)
		if adminCount <= 1 {
			writeError(w, http.StatusBadRequest, "cannot remove the last admin")
			return
		}
	}

	result, err := h.db.Exec(`DELETE FROM family_members WHERE id = ?`, id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to delete")
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}

	if h.vikunja != nil && vikunjaProjectID > 0 {
		if err := h.vikunja.DeleteProject(r.Context(), vikunjaProjectID); err != nil {
			log.Printf("failed to delete Vikunja project %d for member %s: %v", vikunjaProjectID, id, err)
		}
	}

	if h.choreTemplates != nil {
		if err := h.choreTemplates.RemoveMemberFromTemplates(id); err != nil {
			log.Printf("failed to clean up chore templates for member %s: %v", id, err)
		}
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func usernameTaken(database *db.DB, username, excludeID string) bool {
	if username == "" {
		return false
	}
	var count int
	if excludeID == "" {
		database.QueryRow(`SELECT COUNT(*) FROM family_members WHERE username = ?`, username).Scan(&count)
	} else {
		database.QueryRow(`SELECT COUNT(*) FROM family_members WHERE username = ? AND id != ?`, username, excludeID).Scan(&count)
	}
	return count > 0
}
