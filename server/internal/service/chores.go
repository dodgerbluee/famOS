package service

import (
	"database/sql"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type ChoresService struct {
	db   *db.DB
	cash *SandersCashService
}

func NewChoresService(database *db.DB, cash *SandersCashService) *ChoresService {
	return &ChoresService{db: database, cash: cash}
}

type Chore struct {
	ID           string  `json:"id"`
	Title        string  `json:"title"`
	Icon         string  `json:"icon"`
	AssignedTo   *string `json:"assignedTo"`
	AssignedName string  `json:"assignedName,omitempty"`
	Recurrence   string  `json:"recurrence"`
	RewardAmount int     `json:"rewardAmount"`
	Active       bool    `json:"active"`
	CreatedAt    string  `json:"createdAt"`
}

type ChoreWithStatus struct {
	Chore
	Completions []ChoreCompletion `json:"completions"`
}

type ChoreCompletion struct {
	ID            string `json:"id"`
	CompletedBy   string `json:"completedBy"`
	CompletedName string `json:"completedName"`
	CompletedAt   string `json:"completedAt"`
}

func todayKey() string {
	return time.Now().Format("2006-01-02")
}

func (s *ChoresService) ListChores() ([]ChoreWithStatus, error) {
	rows, err := s.db.Query(`
		SELECT c.id, c.title, c.icon, c.assigned_to, c.recurrence, c.reward_amount, c.active, c.created_at,
		       COALESCE(m.name, '')
		FROM chores c
		LEFT JOIN family_members m ON m.id = c.assigned_to
		WHERE c.active = TRUE
		ORDER BY c.created_at
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	dateKey := todayKey()
	var chores []ChoreWithStatus
	for rows.Next() {
		var c ChoreWithStatus
		var assignedTo sql.NullString
		if err := rows.Scan(&c.ID, &c.Title, &c.Icon, &assignedTo, &c.Recurrence, &c.RewardAmount, &c.Active, &c.CreatedAt, &c.AssignedName); err != nil {
			return nil, err
		}
		if assignedTo.Valid {
			c.AssignedTo = &assignedTo.String
		}
		c.Completions, _ = s.getCompletions(c.ID, dateKey)
		if c.Completions == nil {
			c.Completions = []ChoreCompletion{}
		}
		chores = append(chores, c)
	}
	if chores == nil {
		chores = []ChoreWithStatus{}
	}
	return chores, nil
}

func (s *ChoresService) getCompletions(choreID, dateKey string) ([]ChoreCompletion, error) {
	rows, err := s.db.Query(`
		SELECT cc.id, cc.completed_by, COALESCE(m.name, ''), cc.completed_at
		FROM chore_completions cc
		LEFT JOIN family_members m ON m.id = cc.completed_by
		WHERE cc.chore_id = ? AND cc.date_key = ?
		ORDER BY cc.completed_at
	`, choreID, dateKey)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var completions []ChoreCompletion
	for rows.Next() {
		var c ChoreCompletion
		if err := rows.Scan(&c.ID, &c.CompletedBy, &c.CompletedName, &c.CompletedAt); err != nil {
			return nil, err
		}
		completions = append(completions, c)
	}
	return completions, nil
}

type CreateChoreRequest struct {
	Title        string  `json:"title"`
	Icon         string  `json:"icon"`
	AssignedTo   *string `json:"assignedTo"`
	Recurrence   string  `json:"recurrence"`
	RewardAmount int     `json:"rewardAmount"`
}

func (s *ChoresService) CreateChore(req CreateChoreRequest) (*Chore, error) {
	id := uuid.New().String()
	assignedTo := sql.NullString{}
	if req.AssignedTo != nil && *req.AssignedTo != "" {
		assignedTo = sql.NullString{String: *req.AssignedTo, Valid: true}
	}
	if req.Recurrence == "" {
		req.Recurrence = "daily"
	}

	_, err := s.db.Exec(`
		INSERT INTO chores (id, title, icon, assigned_to, recurrence, reward_amount)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, req.Title, req.Icon, assignedTo, req.Recurrence, req.RewardAmount)
	if err != nil {
		return nil, err
	}

	return &Chore{
		ID:           id,
		Title:        req.Title,
		Icon:         req.Icon,
		AssignedTo:   req.AssignedTo,
		Recurrence:   req.Recurrence,
		RewardAmount: req.RewardAmount,
		Active:       true,
	}, nil
}

func (s *ChoresService) UpdateChore(id string, req CreateChoreRequest) error {
	assignedTo := sql.NullString{}
	if req.AssignedTo != nil && *req.AssignedTo != "" {
		assignedTo = sql.NullString{String: *req.AssignedTo, Valid: true}
	}
	_, err := s.db.Exec(`
		UPDATE chores SET title = ?, icon = ?, assigned_to = ?, recurrence = ?, reward_amount = ?
		WHERE id = ?
	`, req.Title, req.Icon, assignedTo, req.Recurrence, req.RewardAmount, id)
	return err
}

func (s *ChoresService) DeleteChore(id string) error {
	_, err := s.db.Exec(`UPDATE chores SET active = FALSE WHERE id = ?`, id)
	return err
}

func (s *ChoresService) CompleteChore(choreID, memberID string) (*ChoreCompletion, error) {
	dateKey := todayKey()

	var exists int
	err := s.db.QueryRow(`SELECT COUNT(*) FROM chore_completions WHERE chore_id = ? AND completed_by = ? AND date_key = ?`,
		choreID, memberID, dateKey).Scan(&exists)
	if err == nil && exists > 0 {
		return nil, nil
	}

	id := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO chore_completions (id, chore_id, completed_by, date_key)
		VALUES (?, ?, ?, ?)
	`, id, choreID, memberID, dateKey)
	if err != nil {
		return nil, err
	}

	var rewardAmount int
	s.db.QueryRow(`SELECT reward_amount FROM chores WHERE id = ?`, choreID).Scan(&rewardAmount)
	if rewardAmount > 0 && s.cash != nil {
		var accountID string
		err := s.db.QueryRow(`SELECT id FROM sanders_cash_accounts WHERE member_id = ?`, memberID).Scan(&accountID)
		if err == nil {
			s.cash.CreateTransaction(accountID, rewardAmount, "earn", "Chore completed", "")
		}
	}

	var name string
	s.db.QueryRow(`SELECT name FROM family_members WHERE id = ?`, memberID).Scan(&name)

	return &ChoreCompletion{
		ID:            id,
		CompletedBy:   memberID,
		CompletedName: name,
		CompletedAt:   time.Now().Format(time.RFC3339),
	}, nil
}

func (s *ChoresService) UncompleteChore(choreID, memberID string) error {
	dateKey := todayKey()

	var rewardAmount int
	s.db.QueryRow(`SELECT reward_amount FROM chores WHERE id = ?`, choreID).Scan(&rewardAmount)
	if rewardAmount > 0 && s.cash != nil {
		var accountID string
		err := s.db.QueryRow(`SELECT id FROM sanders_cash_accounts WHERE member_id = ?`, memberID).Scan(&accountID)
		if err == nil {
			s.cash.CreateTransaction(accountID, -rewardAmount, "adjust", "Chore uncompleted", "")
		}
	}

	_, err := s.db.Exec(`DELETE FROM chore_completions WHERE chore_id = ? AND completed_by = ? AND date_key = ?`,
		choreID, memberID, dateKey)
	return err
}
