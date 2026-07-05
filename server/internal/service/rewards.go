package service

import (
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type RewardsService struct {
	db   *db.DB
	cash *SandersCashService
}

func NewRewardsService(database *db.DB, cash *SandersCashService) *RewardsService {
	return &RewardsService{db: database, cash: cash}
}

type Reward struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Cost        int    `json:"cost"`
	ImageURL    string `json:"imageUrl"`
	Category    string `json:"category"`
	Active      bool   `json:"active"`
	CreatedAt   string `json:"createdAt"`
}

type Redemption struct {
	ID          string `json:"id"`
	RewardID    string `json:"rewardId"`
	MemberID    string `json:"memberId"`
	Status      string `json:"status"`
	RequestedAt string `json:"requestedAt"`
	ResolvedAt  string `json:"resolvedAt"`
	ResolvedBy  string `json:"resolvedBy"`
}

type RedemptionWithDetails struct {
	Redemption
	RewardName  string `json:"rewardName"`
	RewardCost  int    `json:"rewardCost"`
	MemberName  string `json:"memberName"`
	MemberColor string `json:"memberColor"`
}

func (s *RewardsService) ListRewards(activeOnly bool) ([]Reward, error) {
	query := `SELECT id, name, description, cost, image_url, category, active, created_at FROM rewards`
	if activeOnly {
		query += ` WHERE active = TRUE`
	}
	query += ` ORDER BY category, cost`

	rows, err := s.db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var rewards []Reward
	for rows.Next() {
		var r Reward
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Cost, &r.ImageURL, &r.Category, &r.Active, &r.CreatedAt); err != nil {
			return nil, err
		}
		rewards = append(rewards, r)
	}
	return rewards, nil
}

func (s *RewardsService) CreateReward(name, description string, cost int, imageURL, category string) (*Reward, error) {
	id := uuid.New().String()
	_, err := s.db.Exec(`
		INSERT INTO rewards (id, name, description, cost, image_url, category)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, name, description, cost, imageURL, category)
	if err != nil {
		return nil, err
	}

	var r Reward
	err = s.db.QueryRow(`SELECT id, name, description, cost, image_url, category, active, created_at FROM rewards WHERE id = ?`, id).
		Scan(&r.ID, &r.Name, &r.Description, &r.Cost, &r.ImageURL, &r.Category, &r.Active, &r.CreatedAt)
	return &r, err
}

func (s *RewardsService) UpdateReward(id string, name, description *string, cost *int, imageURL, category *string, active *bool) error {
	if name != nil {
		s.db.Exec(`UPDATE rewards SET name = ? WHERE id = ?`, *name, id)
	}
	if description != nil {
		s.db.Exec(`UPDATE rewards SET description = ? WHERE id = ?`, *description, id)
	}
	if cost != nil {
		s.db.Exec(`UPDATE rewards SET cost = ? WHERE id = ?`, *cost, id)
	}
	if imageURL != nil {
		s.db.Exec(`UPDATE rewards SET image_url = ? WHERE id = ?`, *imageURL, id)
	}
	if category != nil {
		s.db.Exec(`UPDATE rewards SET category = ? WHERE id = ?`, *category, id)
	}
	if active != nil {
		s.db.Exec(`UPDATE rewards SET active = ? WHERE id = ?`, *active, id)
	}
	return nil
}

func (s *RewardsService) DeleteReward(id string) error {
	_, err := s.db.Exec(`DELETE FROM rewards WHERE id = ?`, id)
	return err
}

func (s *RewardsService) RequestRedemption(rewardID, memberID string) (*Redemption, error) {
	var cost int
	err := s.db.QueryRow(`SELECT cost FROM rewards WHERE id = ? AND active = TRUE`, rewardID).Scan(&cost)
	if err != nil {
		return nil, fmt.Errorf("reward not found or inactive")
	}

	account, err := s.cash.GetAccountByMemberID(memberID)
	if err != nil {
		return nil, fmt.Errorf("member account not found")
	}

	if account.Balance < cost {
		return nil, fmt.Errorf("insufficient balance: have $%.2f, need $%.2f", float64(account.Balance)/100, float64(cost)/100)
	}

	id := uuid.New().String()
	_, err = s.db.Exec(`
		INSERT INTO redemptions (id, reward_id, member_id, status)
		VALUES (?, ?, ?, 'pending')
	`, id, rewardID, memberID)
	if err != nil {
		return nil, err
	}

	return &Redemption{
		ID:          id,
		RewardID:    rewardID,
		MemberID:    memberID,
		Status:      "pending",
		RequestedAt: time.Now().Format(time.RFC3339),
	}, nil
}

func (s *RewardsService) ResolveRedemption(redemptionID, resolvedBy, status string) error {
	if status != "approved" && status != "denied" {
		return fmt.Errorf("status must be approved or denied")
	}

	var rewardID, memberID, currentStatus string
	err := s.db.QueryRow(`SELECT reward_id, member_id, status FROM redemptions WHERE id = ?`, redemptionID).
		Scan(&rewardID, &memberID, &currentStatus)
	if err != nil {
		return fmt.Errorf("redemption not found")
	}
	if currentStatus != "pending" {
		return fmt.Errorf("redemption already resolved")
	}

	if status == "approved" {
		var cost int
		s.db.QueryRow(`SELECT cost FROM rewards WHERE id = ?`, rewardID).Scan(&cost)

		account, err := s.cash.GetAccountByMemberID(memberID)
		if err != nil {
			return fmt.Errorf("member account not found")
		}

		var rewardName string
		s.db.QueryRow(`SELECT name FROM rewards WHERE id = ?`, rewardID).Scan(&rewardName)

		_, err = s.cash.CreateTransaction(account.ID, cost, "spend", "Redeemed: "+rewardName, resolvedBy)
		if err != nil {
			return err
		}
	}

	_, err = s.db.Exec(`UPDATE redemptions SET status = ?, resolved_at = CURRENT_TIMESTAMP, resolved_by = ? WHERE id = ?`,
		status, resolvedBy, redemptionID)
	return err
}

func (s *RewardsService) ListRedemptions(status string) ([]RedemptionWithDetails, error) {
	query := `
		SELECT r.id, r.reward_id, r.member_id, r.status, r.requested_at,
		       COALESCE(r.resolved_at, ''), COALESCE(r.resolved_by, ''),
		       rw.name, rw.cost, m.name, m.color
		FROM redemptions r
		JOIN rewards rw ON rw.id = r.reward_id
		JOIN family_members m ON m.id = r.member_id
	`
	var args []any
	if status != "" {
		query += ` WHERE r.status = ?`
		args = append(args, status)
	}
	query += ` ORDER BY r.requested_at DESC`

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var redemptions []RedemptionWithDetails
	for rows.Next() {
		var rd RedemptionWithDetails
		if err := rows.Scan(&rd.ID, &rd.RewardID, &rd.MemberID, &rd.Status, &rd.RequestedAt,
			&rd.ResolvedAt, &rd.ResolvedBy, &rd.RewardName, &rd.RewardCost, &rd.MemberName, &rd.MemberColor); err != nil {
			return nil, err
		}
		redemptions = append(redemptions, rd)
	}
	return redemptions, nil
}
