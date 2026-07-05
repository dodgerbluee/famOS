package service

import (
	"database/sql"
	"fmt"

	"github.com/google/uuid"
	"github.com/sandershome/server/internal/db"
)

type SandersCashService struct {
	db *db.DB
}

func NewSandersCashService(database *db.DB) *SandersCashService {
	return &SandersCashService{db: database}
}

type Account struct {
	ID       string `json:"id"`
	MemberID string `json:"memberId"`
	Balance  int    `json:"balance"`
}

type AccountWithMember struct {
	Account
	MemberName  string `json:"memberName"`
	MemberColor string `json:"memberColor"`
}

type Transaction struct {
	ID        string `json:"id"`
	AccountID string `json:"accountId"`
	Amount    int    `json:"amount"`
	Type      string `json:"type"`
	Reason    string `json:"reason"`
	AwardedBy string `json:"awardedBy"`
	CreatedAt string `json:"createdAt"`
}

type TransactionWithNames struct {
	Transaction
	AwardedByName string `json:"awardedByName"`
}

func (s *SandersCashService) ListAccounts() ([]AccountWithMember, error) {
	rows, err := s.db.Query(`
		SELECT a.id, a.member_id, a.balance, m.name, m.color
		FROM sanders_cash_accounts a
		JOIN family_members m ON m.id = a.member_id
		WHERE m.role = 'kid'
		ORDER BY a.balance DESC, m.name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var accounts []AccountWithMember
	for rows.Next() {
		var a AccountWithMember
		if err := rows.Scan(&a.ID, &a.MemberID, &a.Balance, &a.MemberName, &a.MemberColor); err != nil {
			return nil, err
		}
		accounts = append(accounts, a)
	}
	return accounts, nil
}

func (s *SandersCashService) GetAccount(memberID string) (*AccountWithMember, error) {
	var a AccountWithMember
	err := s.db.QueryRow(`
		SELECT a.id, a.member_id, a.balance, m.name, m.color
		FROM sanders_cash_accounts a
		JOIN family_members m ON m.id = a.member_id
		WHERE a.member_id = ?
	`, memberID).Scan(&a.ID, &a.MemberID, &a.Balance, &a.MemberName, &a.MemberColor)
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func (s *SandersCashService) CreateTransaction(accountID string, amount int, txType, reason, awardedBy string) (*Transaction, error) {
	if txType == "spend" && amount > 0 {
		amount = -amount
	}

	tx, err := s.db.Begin()
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	if txType == "spend" {
		var balance int
		err := tx.QueryRow(`SELECT balance FROM sanders_cash_accounts WHERE id = ?`, accountID).Scan(&balance)
		if err != nil {
			return nil, err
		}
		if balance+amount < 0 {
			return nil, fmt.Errorf("insufficient balance: have %d, need %d", balance, -amount)
		}
	}

	id := uuid.New().String()
	awardedByVal := sql.NullString{String: awardedBy, Valid: awardedBy != ""}

	_, err = tx.Exec(`
		INSERT INTO sanders_cash_transactions (id, account_id, amount, type, reason, awarded_by)
		VALUES (?, ?, ?, ?, ?, ?)
	`, id, accountID, amount, txType, reason, awardedByVal)
	if err != nil {
		return nil, err
	}

	_, err = tx.Exec(`UPDATE sanders_cash_accounts SET balance = balance + ? WHERE id = ?`, amount, accountID)
	if err != nil {
		return nil, err
	}

	if err := tx.Commit(); err != nil {
		return nil, err
	}

	var t Transaction
	err = s.db.QueryRow(`
		SELECT id, account_id, amount, type, reason, COALESCE(awarded_by, ''), created_at
		FROM sanders_cash_transactions WHERE id = ?
	`, id).Scan(&t.ID, &t.AccountID, &t.Amount, &t.Type, &t.Reason, &t.AwardedBy, &t.CreatedAt)

	return &t, err
}

func (s *SandersCashService) GetTransactions(accountID string, limit int) ([]TransactionWithNames, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.db.Query(`
		SELECT t.id, t.account_id, t.amount, t.type, t.reason, COALESCE(t.awarded_by, ''), t.created_at,
		       COALESCE(m.name, '')
		FROM sanders_cash_transactions t
		LEFT JOIN family_members m ON m.id = t.awarded_by
		WHERE t.account_id = ?
		ORDER BY t.created_at DESC
		LIMIT ?
	`, accountID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var txns []TransactionWithNames
	for rows.Next() {
		var t TransactionWithNames
		if err := rows.Scan(&t.ID, &t.AccountID, &t.Amount, &t.Type, &t.Reason, &t.AwardedBy, &t.CreatedAt, &t.AwardedByName); err != nil {
			return nil, err
		}
		txns = append(txns, t)
	}
	return txns, nil
}

func (s *SandersCashService) GetAccountByMemberID(memberID string) (*Account, error) {
	var a Account
	err := s.db.QueryRow(`SELECT id, member_id, balance FROM sanders_cash_accounts WHERE member_id = ?`, memberID).
		Scan(&a.ID, &a.MemberID, &a.Balance)
	if err != nil {
		return nil, err
	}
	return &a, nil
}
