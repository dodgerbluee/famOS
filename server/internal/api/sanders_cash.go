package api

import (
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
	"github.com/sandershome/server/internal/service"
)

type SandersCashHandler struct {
	svc *service.SandersCashService
	hub *Hub
}

func NewSandersCashHandler(svc *service.SandersCashService, hub *Hub) *SandersCashHandler {
	return &SandersCashHandler{svc: svc, hub: hub}
}

func (h *SandersCashHandler) ListAccounts(w http.ResponseWriter, r *http.Request) {
	accounts, err := h.svc.ListAccounts()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to list accounts")
		return
	}
	if accounts == nil {
		accounts = []service.AccountWithMember{}
	}
	writeJSON(w, http.StatusOK, accounts)
}

func (h *SandersCashHandler) GetAccount(w http.ResponseWriter, r *http.Request) {
	memberID := chi.URLParam(r, "memberId")
	account, err := h.svc.GetAccount(memberID)
	if err != nil {
		writeError(w, http.StatusNotFound, "account not found")
		return
	}
	writeJSON(w, http.StatusOK, account)
}

func (h *SandersCashHandler) CreateTransaction(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AccountID string `json:"accountId"`
		Amount    int    `json:"amount"`
		Type      string `json:"type"`
		Reason    string `json:"reason"`
		AwardedBy string `json:"awardedBy"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	if req.Amount == 0 {
		writeError(w, http.StatusBadRequest, "amount cannot be zero")
		return
	}
	if req.Type != "earn" && req.Type != "spend" && req.Type != "adjust" {
		writeError(w, http.StatusBadRequest, "type must be earn, spend, or adjust")
		return
	}
	if req.Reason == "" {
		writeError(w, http.StatusBadRequest, "reason is required")
		return
	}

	txn, err := h.svc.CreateTransaction(req.AccountID, req.Amount, req.Type, req.Reason, req.AwardedBy)
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.hub.Broadcast("sanders_cash_transaction", txn)

	accounts, _ := h.svc.ListAccounts()
	if accounts != nil {
		h.hub.Broadcast("sanders_cash_accounts", accounts)
	}

	writeJSON(w, http.StatusCreated, txn)
}

func (h *SandersCashHandler) GetTransactions(w http.ResponseWriter, r *http.Request) {
	accountID := chi.URLParam(r, "accountId")
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	if limit <= 0 {
		limit = 50
	}

	txns, err := h.svc.GetTransactions(accountID, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to get transactions")
		return
	}
	if txns == nil {
		txns = []service.TransactionWithNames{}
	}
	writeJSON(w, http.StatusOK, txns)
}

func (h *SandersCashHandler) QuickAward(w http.ResponseWriter, r *http.Request) {
	memberID := chi.URLParam(r, "memberId")

	var req struct {
		Amount int    `json:"amount"`
		Reason string `json:"reason"`
	}
	if err := readJSON(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	account, err := h.svc.GetAccountByMemberID(memberID)
	if err != nil {
		writeError(w, http.StatusNotFound, "account not found for member")
		return
	}

	txn, err := h.svc.CreateTransaction(account.ID, req.Amount, "earn", req.Reason, "")
	if err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	h.hub.Broadcast("sanders_cash_transaction", txn)

	accounts, _ := h.svc.ListAccounts()
	if accounts != nil {
		h.hub.Broadcast("sanders_cash_accounts", accounts)
	}

	writeJSON(w, http.StatusCreated, txn)
}
