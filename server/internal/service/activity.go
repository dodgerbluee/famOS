package service

import (
	"context"
	"sort"
	"time"

	"github.com/sandershome/server/internal/db"
)

type ActivityService struct {
	db      *db.DB
	vikunja *VikunjaService
	loc     *time.Location
}

type ActivityDay struct {
	DateKey    string `json:"dateKey"`
	MemberID   string `json:"memberId"`
	MemberName string `json:"memberName"`
	Kind       string `json:"kind"`
	Total      int    `json:"total"`
	Completed  int    `json:"completed"`
}

func NewActivityService(database *db.DB, vikunja *VikunjaService, loc *time.Location) *ActivityService {
	return &ActivityService{db: database, vikunja: vikunja, loc: loc}
}

func (s *ActivityService) Snapshot(ctx context.Context, familyID string) error {
	rows, err := s.db.Query(`SELECT id, role, COALESCE(vikunja_project_id, 0) FROM family_members WHERE family_id = ? AND role != 'kiosk'`, familyID)
	if err != nil {
		return err
	}
	type member struct {
		id, role  string
		projectID int64
	}
	var members []member
	for rows.Next() {
		var m member
		if err := rows.Scan(&m.id, &m.role, &m.projectID); err != nil {
			rows.Close()
			return err
		}
		members = append(members, m)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}

	today := time.Now().In(s.loc).Format("2006-01-02")
	for _, member := range members {
		if member.projectID == 0 {
			continue
		}
		tasks, err := s.vikunja.GetTasksForProject(ctx, member.projectID)
		if err != nil {
			continue
		}
		seen := make(map[int64]bool, len(tasks))
		for _, task := range tasks {
			seen[task.ID] = true
		}
		if completedTasks, completedErr := s.vikunja.GetCompletedTasks(ctx, member.projectID); completedErr == nil {
			for _, completed := range completedTasks {
				if seen[completed.ID] {
					continue
				}
				dueDate := completed.DueDate
				if dueDate == "" && member.role == "kid" {
					dueDate = completed.DoneAt
				}
				tasks = append(tasks, VikunjaTask{ID: completed.ID, Title: completed.Title, Done: true, DueDate: dueDate, ProjectID: completed.ProjectID})
			}
		}
		kind := "task"
		if member.role == "kid" {
			kind = "chore"
		}
		counts := map[string][2]int{}
		for _, task := range tasks {
			if member.role != "kid" && task.DueDate == "" {
				continue
			}
			dateKey := today
			if task.DueDate != "" {
				if due, err := time.Parse(time.RFC3339, task.DueDate); err == nil {
					dateKey = due.In(s.loc).Format("2006-01-02")
				}
			}
			count := counts[dateKey]
			count[0]++
			if task.Done {
				count[1]++
			}
			counts[dateKey] = count
		}
		for dateKey, count := range counts {
			_, _ = s.db.Exec(`INSERT INTO work_activity_daily (family_id, member_id, kind, date_key, total, completed)
				VALUES (?, ?, ?, ?, ?, ?)
				ON CONFLICT(family_id, member_id, kind, date_key) DO UPDATE SET
				total = MAX(total, excluded.total), completed = MAX(completed, excluded.completed), updated_at = CURRENT_TIMESTAMP`,
				familyID, member.id, kind, dateKey, count[0], count[1])
		}
	}
	return nil
}

func (s *ActivityService) SnapshotAll(ctx context.Context) error {
	rows, err := s.db.Query(`SELECT id FROM families`)
	if err != nil {
		return err
	}
	var familyIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return err
		}
		familyIDs = append(familyIDs, id)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return err
	}
	for _, familyID := range familyIDs {
		_ = s.Snapshot(ctx, familyID)
	}
	return nil
}

func (s *ActivityService) RecordCompletion(familyID, memberID, kind, dateKey string) error {
	_, err := s.db.Exec(`INSERT INTO work_activity_daily (family_id, member_id, kind, date_key, total, completed)
		VALUES (?, ?, ?, ?, 1, 1)
		ON CONFLICT(family_id, member_id, kind, date_key) DO UPDATE SET
		completed = MIN(total, completed + 1), updated_at = CURRENT_TIMESTAMP`, familyID, memberID, kind, dateKey)
	return err
}

func (s *ActivityService) List(ctx context.Context, familyID string, days int) ([]ActivityDay, error) {
	_ = s.Snapshot(ctx, familyID)
	if days < 7 {
		days = 7
	}
	if days > 366 {
		days = 366
	}
	start := time.Now().In(s.loc).AddDate(0, 0, -days+1).Format("2006-01-02")
	rows, err := s.db.Query(`SELECT a.date_key, a.member_id, m.name, a.kind, a.total, a.completed
		FROM work_activity_daily a JOIN family_members m ON m.id = a.member_id
		WHERE a.family_id = ? AND a.date_key >= ? ORDER BY a.date_key, m.name`, familyID, start)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	result := []ActivityDay{}
	for rows.Next() {
		var day ActivityDay
		if err := rows.Scan(&day.DateKey, &day.MemberID, &day.MemberName, &day.Kind, &day.Total, &day.Completed); err != nil {
			return nil, err
		}
		result = append(result, day)
	}
	sort.SliceStable(result, func(i, j int) bool { return result[i].DateKey < result[j].DateKey })
	return result, rows.Err()
}

func (s *ActivityService) MemberForProject(familyID string, projectID int64) (memberID, role string, err error) {
	err = s.db.QueryRow(`SELECT id, role FROM family_members WHERE family_id = ? AND vikunja_project_id = ?`, familyID, projectID).Scan(&memberID, &role)
	return
}
