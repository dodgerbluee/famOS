package service

import (
	"context"
	"strings"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type CompletedTaskFetcher interface {
	GetCompletedTasks(ctx context.Context, projectID int64) ([]CompletedTask, error)
}

type ChorePollerService struct {
	db      *db.DB
	fetcher CompletedTaskFetcher
	cash    *SandersCashService
}

func NewChorePollerService(database *db.DB, fetcher CompletedTaskFetcher, cash *SandersCashService) *ChorePollerService {
	return &ChorePollerService{db: database, fetcher: fetcher, cash: cash}
}

func (s *ChorePollerService) Poll(ctx context.Context) error {
	rows, err := s.db.Query(`
		SELECT fm.id, fm.vikunja_project_id
		FROM family_members fm
		WHERE fm.role = 'kid' AND fm.vikunja_project_id > 0
	`)
	if err != nil {
		return err
	}
	defer rows.Close()

	type kidProject struct {
		memberID  string
		projectID int64
	}
	var kids []kidProject
	for rows.Next() {
		var kp kidProject
		if err := rows.Scan(&kp.memberID, &kp.projectID); err != nil {
			return err
		}
		kids = append(kids, kp)
	}

	for _, kid := range kids {
		tasks, err := s.fetcher.GetCompletedTasks(ctx, kid.projectID)
		if err != nil {
			continue
		}

		for _, task := range tasks {
			templateID := ""
			for _, label := range task.Labels {
				if strings.HasPrefix(label, "template:") {
					templateID = strings.TrimPrefix(label, "template:")
					break
				}
			}
			if templateID == "" {
				continue
			}

			var already int
			s.db.QueryRow(`SELECT COUNT(*) FROM chore_completion_log WHERE vikunja_task_id = ?`, task.ID).Scan(&already)
			if already > 0 {
				continue
			}

			var rewardAmount int
			err := s.db.QueryRow(`SELECT reward_amount FROM chore_templates WHERE id = ? AND active = TRUE`, templateID).Scan(&rewardAmount)
			if err != nil {
				continue
			}

			if rewardAmount > 0 {
				var accountID string
				err := s.db.QueryRow(`SELECT id FROM sanders_cash_accounts WHERE member_id = ?`, kid.memberID).Scan(&accountID)
				if err == nil {
					s.cash.CreateTransaction(accountID, rewardAmount, "earn", "Chore completed: "+task.Title, "", "", "")
				}
			}

			s.db.Exec(`INSERT INTO chore_completion_log (id, vikunja_task_id, template_id, member_id) VALUES (?, ?, ?, ?)`,
				uuid.New().String(), task.ID, templateID, kid.memberID)
		}
	}

	return nil
}
