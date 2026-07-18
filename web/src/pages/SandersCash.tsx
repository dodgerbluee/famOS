import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type AccountWithMember, type TransactionWithNames } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { Leaderboard } from '../components/sanders-cash/Leaderboard';
import { AwardModal } from '../components/sanders-cash/AwardModal';
import { AdjustModal } from '../components/sanders-cash/AdjustModal';
import { TransactionHistory } from '../components/sanders-cash/TransactionHistory';

export function SandersCash() {
  const [accounts, setAccounts] = useState<AccountWithMember[]>([]);
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithNames[]>([]);
  const [showAward, setShowAward] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const navigate = useNavigate();

  const loadAccounts = useCallback(() => {
    api.get<AccountWithMember[]>('/api/sanders-cash/accounts').then(setAccounts).catch(() => {});
  }, []);

  const loadTransactions = useCallback((memberId: string) => {
    const account = accounts.find((a) => a.memberId === memberId);
    if (!account) return;
    api
      .get<TransactionWithNames[]>(`/api/sanders-cash/transactions/${account.id}`)
      .then(setTransactions)
      .catch(() => {});
  }, [accounts]);

  useEffect(loadAccounts, [loadAccounts]);

  useEffect(() => {
    if (selectedMember) loadTransactions(selectedMember);
  }, [selectedMember, loadTransactions]);

  useWebSocket((msg) => {
    if (msg.type === 'sanders_cash_accounts') {
      setAccounts(msg.payload as AccountWithMember[]);
      if (selectedMember) loadTransactions(selectedMember);
    }
  });

  const selectedAccount = accounts.find((a) => a.memberId === selectedMember);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Sanders Cash</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAward(true)}
            className="bg-primary text-white text-sm font-medium px-3 py-2 min-h-[44px] rounded-xl active:scale-95 transition-transform"
          >
            + Award
          </button>
          <button
            onClick={() => setShowAdjust(true)}
            className="bg-surface-light text-text-bright text-sm font-medium px-3 py-2 min-h-[44px] rounded-xl active:scale-95 transition-transform"
          >
            Adjust
          </button>
          <button
            onClick={() => navigate('/sanders-cash/store')}
            className="text-primary-light text-sm font-medium px-3 py-2 min-h-[44px]"
          >
            Store →
          </button>
        </div>
      </div>

      <Leaderboard
        accounts={accounts}
        onSelect={(id) => setSelectedMember(id === selectedMember ? null : id)}
      />

      {selectedAccount && (
        <div className="bg-surface rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-bg"
              style={{ backgroundColor: selectedAccount.memberColor }}
            >
              {selectedAccount.memberName[0]}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-text-bright">
                {selectedAccount.memberName}
              </h2>
              <p className="text-accent-green font-bold">
                Balance: ${(selectedAccount.balance / 100).toFixed(2)}
              </p>
            </div>
          </div>
          <TransactionHistory transactions={transactions} />
        </div>
      )}

      {showAward && (
        <AwardModal
          accounts={accounts}
          onAwarded={loadAccounts}
          onClose={() => setShowAward(false)}
        />
      )}

      {showAdjust && (
        <AdjustModal
          accounts={accounts}
          onAdjusted={loadAccounts}
          onClose={() => setShowAdjust(false)}
        />
      )}
    </div>
  );
}
