package api

import (
	"encoding/json"
	"log"
	"net/http"

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
	CreatedAt        string `json:"createdAt"`
}

type CreateFamilyMemberRequest struct {
	Name  string `json:"name"`
	Role  string `json:"role"`
	Color string `json:"color"`
	Pin   string `json:"pin,omitempty"`
}

func (h *FamilyHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, name, role, avatar_url, color, sort_order, COALESCE(birthday, ''), COALESCE(vikunja_project_id, 0), created_at FROM family_members ORDER BY sort_order, name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list family members")
		return
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.Birthday, &m.VikunjaProjectID, &m.CreatedAt); err != nil {
			writeError(w, http.StatusInternalServerError, "failed to scan family member")
			return
		}
		members = append(members, m)
	}

	writeJSON(w, http.StatusOK, members)
}

func (h *FamilyHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var m FamilyMember
	err := h.db.QueryRow(`SELECT id, name, role, avatar_url, color, sort_order, COALESCE(birthday, ''), COALESCE(vikunja_project_id, 0), created_at FROM family_members WHERE id = ?`, id).
		Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.Birthday, &m.VikunjaProjectID, &m.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (h *FamilyHandler) getOrCreateFamilyProject(r *http.Request) int64 {
	var raw string
	err := h.db.QueryRow(`SELECT value FROM app_settings WHERE key = 'vikunja_family_project_id'`).Scan(&raw)
	if err == nil && raw != "" {
		var id int64
		if json.Unmarshal([]byte(raw), &id) == nil && id > 0 {
			return id
		}
	}

	projectID, err := h.vikunja.CreateProject(r.Context(), "Family", 0)
	if err != nil {
		log.Printf("failed to create Vikunja family project: %v", err)
		return 0
	}

	encoded, _ := json.Marshal(projectID)
	h.db.Exec(`INSERT INTO app_settings (key, value) VALUES ('vikunja_family_project_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, string(encoded))
	return projectID
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

	_, err = tx.Exec(`INSERT INTO family_members (id, name, role, pin_hash, color, family_id) VALUES (?, ?, ?, ?, ?, ?)`,
		id, req.Name, req.Role, pinHash, req.Color, familyID)
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

	if h.vikunja != nil {
		parentProjectID := h.getOrCreateFamilyProject(r)
		if parentProjectID > 0 {
			projectID, err := h.vikunja.CreateProject(r.Context(), req.Name, parentProjectID)
			if err != nil {
				log.Printf("failed to create Vikunja project for member %s: %v", req.Name, err)
			} else {
				h.db.Exec(`UPDATE family_members SET vikunja_project_id = ? WHERE id = ?`, projectID, id)
			}
		}
	}

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (h *FamilyHandler) BackfillVikunjaProjects(w http.ResponseWriter, r *http.Request) {
	if h.vikunja == nil {
		writeError(w, http.StatusBadRequest, "Vikunja not configured")
		return
	}

	parentProjectID := h.getOrCreateFamilyProject(r)
	if parentProjectID == 0 {
		writeError(w, http.StatusInternalServerError, "failed to get or create family project")
		return
	}

	rows, err := h.db.Query(`SELECT id, name FROM family_members WHERE COALESCE(vikunja_project_id, 0) = 0`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to query members")
		return
	}
	defer rows.Close()

	type result struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	var created []result
	var errors []string

	for rows.Next() {
		var id, name string
		if err := rows.Scan(&id, &name); err != nil {
			continue
		}
		projectID, err := h.vikunja.CreateProject(r.Context(), name, parentProjectID)
		if err != nil {
			errors = append(errors, name+": "+err.Error())
			continue
		}
		h.db.Exec(`UPDATE family_members SET vikunja_project_id = ? WHERE id = ?`, projectID, id)
		created = append(created, result{ID: id, Name: name})
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"created": created,
		"errors":  errors,
	})
}

func (h *FamilyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		AvatarURL *string `json:"avatarUrl"`
		SortOrder *int    `json:"sortOrder"`
		Birthday  *string `json:"birthday"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
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

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *FamilyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	// Look up Vikunja project ID before deleting
	var vikunjaProjectID int64
	h.db.QueryRow(`SELECT COALESCE(vikunja_project_id, 0) FROM family_members WHERE id = ?`, id).Scan(&vikunjaProjectID)

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

	// Clean up Vikunja project
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
