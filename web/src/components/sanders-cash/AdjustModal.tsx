import { useState } from 'react';
import { api, type AccountWithMember } from '../../api/client';

interface AdjustModalProps {
  accounts: AccountWithMember[];
  onAdjusted: () => void;
  onClose: () => void;
}

export function AdjustModal({ accounts, onAdjusted, onClose }: AdjustModalProps) {
  const [selectedKid, setSelectedKid] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [direction, setDirection] = useState<'add' | 'subtract'>('add');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const cents = Math.round((parseFloat(amount) || 0) * 100);
  const selectedAccount = accounts.find((a) => a.memberId === selectedKid);

  const handleSubmit = async () => {
    if (!selectedKid || !selectedAccount) {
      setError('Select a kid');
      return;
    }
    if (cents <= 0) {
      setError('Enter an amount');
      return;
    }
    if (!reason.trim()) {
      setError('Enter a reason');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      await api.post('/api/sanders-cash/transactions', {
        accountId: selectedAccount.id,
        amount: direction === 'subtract' ? -cents : cents,
        type: 'adjust',
        reason: reason.trim(),
        awardedBy: '',
      });
      onAdjusted();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to adjust');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-bright">Adjust Balance</h2>
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
          <label className="block text-sm text-text-dim mb-2">Direction</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('add')}
              className={`flex-1 py-3 rounded-xl font-semibold min-h-[48px] transition-colors ${
                direction === 'add'
                  ? 'bg-accent-green text-bg'
                  : 'bg-surface-light text-text-dim'
              }`}
            >
              + Add
            </button>
            <button
              type="button"
              onClick={() => setDirection('subtract')}
              className={`flex-1 py-3 rounded-xl font-semibold min-h-[48px] transition-colors ${
                direction === 'subtract'
                  ? 'bg-accent-red text-white'
                  : 'bg-surface-light text-text-dim'
              }`}
            >
              − Subtract
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold text-lg">$</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-surface-light text-text-bright rounded-xl pl-7 pr-3 py-3 outline-none font-bold text-lg min-h-[48px] focus:ring-2 focus:ring-primary"
            />
          </div>
          {selectedAccount && cents > 0 && (
            <p className="text-xs text-text-dim mt-1.5">
              New balance: ${((selectedAccount.balance + (direction === 'subtract' ? -cents : cents)) / 100).toFixed(2)}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-2">Reason</label>
          <input
            type="text"
            placeholder="Why are you adjusting?"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full bg-surface-light text-text-bright rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || cents <= 0 || !selectedKid || !reason.trim()}
          className={`w-full font-bold py-4 rounded-xl text-lg min-h-[56px] active:scale-95 transition-transform disabled:opacity-50 ${
            direction === 'subtract'
              ? 'bg-accent-red text-white'
              : 'bg-accent-green text-bg'
          }`}
        >
          {submitting
            ? 'Adjusting...'
            : cents > 0
              ? `${direction === 'subtract' ? '−' : '+'} $${(cents / 100).toFixed(2)}`
              : 'Adjust'}
        </button>
      </div>
    </div>
  );
}
