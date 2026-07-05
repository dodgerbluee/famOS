import { useState } from 'react';
import { api, type AccountWithMember } from '../../api/client';

interface AwardModalProps {
  accounts: AccountWithMember[];
  onAwarded: () => void;
  onClose: () => void;
}

const PRESET_AMOUNTS = [500, 1000, 2000, 5000, 10000];
const QUICK_REASONS = ['Great job!', 'Chores done', 'Being kind', 'Good grades', 'Helping out'];

export function AwardModal({ accounts, onAwarded, onClose }: AwardModalProps) {
  const [selectedKid, setSelectedKid] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [reason, setReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [awarding, setAwarding] = useState(false);
  const [error, setError] = useState('');

  const effectiveAmount = amount ?? Math.round((parseFloat(customAmount) || 0) * 100);
  const effectiveReason = customReason || reason;

  const handleAward = async () => {
    if (!selectedKid) {
      setError('Select a kid');
      return;
    }
    if (effectiveAmount <= 0) {
      setError('Enter an amount');
      return;
    }
    if (!effectiveReason) {
      setError('Choose or enter a reason');
      return;
    }

    setAwarding(true);
    setError('');
    try {
      const account = accounts.find((a) => a.memberId === selectedKid);
      if (!account) return;
      await api.post('/api/sanders-cash/transactions', {
        accountId: account.id,
        amount: effectiveAmount,
        type: 'earn',
        reason: effectiveReason,
        awardedBy: '',
      });
      onAwarded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to award');
    } finally {
      setAwarding(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-bright">Award Sanders Cash</h2>
          <button
            onClick={onClose}
            className="text-text-dim text-2xl leading-none p-2 -mr-2 -mt-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Who</label>
          <div className="flex gap-2 flex-wrap">
            {accounts.map((account) => (
              <button
                key={account.memberId}
                type="button"
                onClick={() => setSelectedKid(account.memberId)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl font-medium transition-all min-h-[48px] ${
                  selectedKid === account.memberId
                    ? 'ring-2 ring-primary bg-primary/10'
                    : 'bg-surface-light'
                }`}
              >
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold text-bg"
                  style={{ backgroundColor: account.memberColor }}
                >
                  {account.memberName[0]}
                </div>
                <span className="text-text-bright">{account.memberName}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Amount</label>
          <div className="grid grid-cols-3 gap-2">
            {PRESET_AMOUNTS.map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => {
                  setAmount(a);
                  setCustomAmount('');
                }}
                className={`py-3 rounded-xl font-bold transition-colors min-h-[48px] text-lg ${
                  amount === a
                    ? 'bg-accent-green text-bg'
                    : 'bg-surface-light text-text-dim'
                }`}
              >
                ${a / 100}
              </button>
            ))}
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold text-lg">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Other"
                value={customAmount}
                onFocus={() => setAmount(null)}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  setAmount(null);
                }}
                className={`w-full h-full bg-surface-light text-text-bright rounded-xl pl-7 pr-3 py-3 outline-none font-bold text-lg min-h-[48px] ${
                  amount === null && customAmount ? 'ring-2 ring-accent-green' : ''
                }`}
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Reason</label>
          <div className="flex gap-2 flex-wrap">
            {QUICK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => {
                  setReason(r);
                  setCustomReason('');
                }}
                className={`px-3 py-2 rounded-xl text-sm transition-colors min-h-[44px] ${
                  reason === r && !customReason
                    ? 'bg-primary text-white'
                    : 'bg-surface-light text-text-dim'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Or type a custom reason..."
            value={customReason}
            onChange={(e) => setCustomReason(e.target.value)}
            className="w-full mt-2 bg-surface-light text-text-bright rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <button
          type="button"
          onClick={handleAward}
          disabled={awarding || effectiveAmount <= 0 || !selectedKid || !effectiveReason}
          className="w-full bg-accent-green text-bg font-bold py-4 rounded-xl text-lg min-h-[56px] active:scale-95 transition-transform disabled:opacity-50"
        >
          {awarding
            ? 'Awarding...'
            : effectiveAmount > 0
              ? `Award $${(effectiveAmount / 100).toFixed(2)}`
              : 'Award'}
        </button>
      </div>
    </div>
  );
}
