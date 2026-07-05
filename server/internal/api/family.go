package api

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type FamilyHandler struct {
	db *db.DB
}

type FamilyMember struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Role      string `json:"role"`
	AvatarURL string `json:"avatarUrl"`
	Color     string `json:"color"`
	SortOrder int    `json:"sortOrder"`
	CreatedAt string `json:"createdAt"`
}

type CreateFamilyMemberRequest struct {
	Name  string `json:"name"`
	Role  string `json:"role"`
	Color string `json:"color"`
	Pin   string `json:"pin,omitempty"`
}

func (h *FamilyHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, name, role, avatar_url, color, sort_order, created_at FROM family_members ORDER BY sort_order, name`)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list family members")
		return
	}
	defer rows.Close()

	members := []FamilyMember{}
	for rows.Next() {
		var m FamilyMember
		if err := rows.Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.CreatedAt); err != nil {
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
	err := h.db.QueryRow(`SELECT id, name, role, avatar_url, color, sort_order, created_at FROM family_members WHERE id = ?`, id).
		Scan(&m.ID, &m.Name, &m.Role, &m.AvatarURL, &m.Color, &m.SortOrder, &m.CreatedAt)
	if err != nil {
		writeError(w, http.StatusNotFound, "family member not found")
		return
	}
	writeJSON(w, http.StatusOK, m)
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

	if req.Role != "parent" && req.Role != "kid" {
		writeError(w, http.StatusBadRequest, "role must be 'parent' or 'kid'")
		return
	}

	id := uuid.New().String()
	var pinHash string
	if req.Pin != "" {
		var err error
		pinHash, err = hashPin(req.Pin)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "failed to hash pin")
			return
		}
	}

	tx, err := h.db.Begin()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start transaction")
		return
	}
	defer tx.Rollback()

	_, err = tx.Exec(`INSERT INTO family_members (id, name, role, pin_hash, color) VALUES (?, ?, ?, ?, ?)`,
		id, req.Name, req.Role, pinHash, req.Color)
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

	writeJSON(w, http.StatusCreated, map[string]string{"id": id})
}

func (h *FamilyHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req struct {
		Name      *string `json:"name"`
		Color     *string `json:"color"`
		AvatarURL *string `json:"avatarUrl"`
		SortOrder *int    `json:"sortOrder"`
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

	writeJSON(w, http.StatusOK, map[string]string{"status": "updated"})
}

func (h *FamilyHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
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
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}
