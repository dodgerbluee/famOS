package service

import (
	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
	"time"
)

type BatchRun struct {
	ID           string  `json:"id"`
	JobName      string  `json:"jobName"`
	Status       string  `json:"status"`
	Result       string  `json:"result"`
	ErrorMessage string  `json:"errorMessage"`
	StartedAt    string  `json:"startedAt"`
	FinishedAt   *string `json:"finishedAt"`
	DurationMs   int64   `json:"durationMs"`
}

type BatchService struct {
	db *db.DB
}

func NewBatchService(database *db.DB) *BatchService {
	return &BatchService{db: database}
}

func (s *BatchService) StartRun(jobName string) string {
	id := uuid.New().String()
	s.db.Exec(
		`INSERT INTO batch_runs (id, job_name, status, started_at) VALUES (?, ?, 'running', ?)`,
		id, jobName, time.Now().UTC().Format(time.RFC3339),
	)
	return id
}

func (s *BatchService) CompleteRun(id, result string) {
	now := time.Now().UTC()
	s.db.Exec(
		`UPDATE batch_runs SET status = 'success', result = ?, finished_at = ?, duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER) WHERE id = ?`,
		result, now.Format(time.RFC3339), now.Format(time.RFC3339), id,
	)
}

func (s *BatchService) FailRun(id, errMsg string) {
	now := time.Now().UTC()
	s.db.Exec(
		`UPDATE batch_runs SET status = 'error', error_message = ?, finished_at = ?, duration_ms = CAST((julianday(?) - julianday(started_at)) * 86400000 AS INTEGER) WHERE id = ?`,
		errMsg, now.Format(time.RFC3339), now.Format(time.RFC3339), id,
	)
}

func (s *BatchService) ListRuns(limit int) ([]BatchRun, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(
		`SELECT id, job_name, status, result, error_message, started_at, finished_at, duration_ms FROM batch_runs ORDER BY started_at DESC LIMIT ?`,
		limit,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var runs []BatchRun
	for rows.Next() {
		var r BatchRun
		if err := rows.Scan(&r.ID, &r.JobName, &r.Status, &r.Result, &r.ErrorMessage, &r.StartedAt, &r.FinishedAt, &r.DurationMs); err != nil {
			continue
		}
		runs = append(runs, r)
	}
	if runs == nil {
		runs = []BatchRun{}
	}
	return runs, nil
}
