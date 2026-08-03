import { useState, useRef, useEffect } from 'react';
import { api, type AccountWithMember } from '../../api/client';

export interface RewardPreset {
  reason: string;
  amount: number;
}

const DEFAULT_PRESETS: RewardPreset[] = [
  { reason: 'Great job!', amount: 500 },
  { reason: 'Chores done', amount: 500 },
  { reason: 'Being kind', amount: 1000 },
  { reason: 'Good grades', amount: 2000 },
  { reason: 'Helping out', amount: 500 },
];

interface AwardModalProps {
  accounts: AccountWithMember[];
  onAwarded: () => void;
  onClose: () => void;
  defaultDirection?: 'earn' | 'subtract';
}

export function AwardModal({ accounts, onAwarded, onClose, defaultDirection = 'earn' }: AwardModalProps) {
  const [selectedKid, setSelectedKid] = useState<string | null>(accounts.length === 1 ? accounts[0].memberId : null);
  const [direction, setDirection] = useState<'earn' | 'subtract'>(defaultDirection);
  const [selectedPreset, setSelectedPreset] = useState<RewardPreset | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [detail, setDetail] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [presets, setPresets] = useState<RewardPreset[]>(DEFAULT_PRESETS);

  useEffect(() => {
    api.get<Record<string, string>>('/api/settings').then((settings) => {
      if (settings.sanders_cash_presets) {
        try {
          const parsed = JSON.parse(settings.sanders_cash_presets) as RewardPreset[];
          if (parsed.length > 0) setPresets(parsed);
        } catch { /* use defaults */ }
      }
    }).catch(() => {});
  }, []);

  const effectiveAmount = selectedPreset?.amount ?? Math.round((parseFloat(customAmount) || 0) * 100);
  const effectiveReason = customReason || (selectedPreset ? (detail ? `${selectedPreset.reason} — ${detail}` : selectedPreset.reason) : '');

  const selectedAccount = accounts.find((a) => a.memberId === selectedKid);

  const handleSubmit = async () => {
    if (!selectedKid) { setError('Select a kid'); return; }
    if (effectiveAmount <= 0) { setError('Enter an amount'); return; }
    if (!effectiveReason) { setError('Choose or enter a reason'); return; }

    setSubmitting(true);
    setError('');
    try {
      const account = accounts.find((a) => a.memberId === selectedKid);
      if (!account) return;

      const photoUrls: string[] = [];
      for (const p of photos) {
        const uploaded = await api.upload('/api/uploads', p.file);
        photoUrls.push(uploaded.url);
      }

      const today = new Date().toISOString().slice(0, 10);
      const finalAmount = direction === 'subtract' ? -effectiveAmount : effectiveAmount;
      await api.post('/api/sanders-cash/transactions', {
        accountId: account.id,
        amount: finalAmount,
        type: direction === 'subtract' ? 'adjust' : 'earn',
        reason: effectiveReason,
        awardedBy: '',
        photoUrls,
        date: date !== today ? date : '',
      });
      onAwarded();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4">
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-text-bright">Sanders Cash</h2>
          <button
            onClick={onClose}
            className="text-text-dim text-2xl leading-none p-2 -mr-2 -mt-2 min-w-[44px] min-h-[44px] flex items-center justify-center"
          >
            ×
          </button>
        </div>

        {/* Direction */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setDirection('earn')}
            className={`flex-1 py-3 rounded-xl font-semibold min-h-[48px] transition-colors ${
              direction === 'earn' ? 'bg-accent-green text-bg' : 'bg-surface-light text-text-dim'
            }`}
          >
            + Award
          </button>
          <button
            type="button"
            onClick={() => setDirection('subtract')}
            className={`flex-1 py-3 rounded-xl font-semibold min-h-[48px] transition-colors ${
              direction === 'subtract' ? 'bg-accent-red text-white' : 'bg-surface-light text-text-dim'
            }`}
          >
            − Subtract
          </button>
        </div>

        {/* Who */}
        {accounts.length > 1 && (
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
        )}

        {/* Reason presets */}
        <div>
          <label className="block text-sm text-text-dim mb-2">Reason</label>
          <div className="flex gap-2 flex-wrap">
            {presets.map((p) => (
              <button
                key={p.reason}
                type="button"
                onClick={() => {
                  if (selectedPreset?.reason === p.reason) {
                    setSelectedPreset(null);
                  } else {
                    setSelectedPreset(p);
                    setCustomAmount('');
                    setCustomReason('');
                  }
                }}
                className={`px-3 py-2 rounded-xl text-sm transition-colors min-h-[44px] ${
                  selectedPreset?.reason === p.reason && !customReason
                    ? 'bg-primary text-white'
                    : 'bg-surface-light text-text-dim'
                }`}
              >
                {p.reason}{direction === 'earn' && p.amount > 0 ? ` · $${(p.amount / 100).toFixed(2)}` : ''}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder={selectedPreset ? `Add detail (e.g. Magic Tree House #1)` : 'Or type a custom reason...'}
            value={selectedPreset ? detail : customReason}
            onChange={(e) => {
              if (selectedPreset) {
                setDetail(e.target.value);
              } else {
                setCustomReason(e.target.value);
              }
            }}
            className="w-full mt-2 bg-surface-light text-text-bright rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
          {selectedPreset && detail && (
            <p className="text-text-dim text-xs mt-1">{selectedPreset.reason} — {detail}</p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm text-text-dim mb-2">Amount</label>
          {selectedPreset && !customAmount ? (
            <div className="flex items-center gap-3">
              <span className="text-text-bright font-bold text-lg">${(selectedPreset.amount / 100).toFixed(2)}</span>
              <span className="text-text-dim text-sm">from preset</span>
              <button
                type="button"
                onClick={() => {
                  setCustomAmount((selectedPreset.amount / 100).toFixed(2));
                  setSelectedPreset({ ...selectedPreset, amount: 0 });
                }}
                className="text-primary-light text-sm ml-auto"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold text-lg">$</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  if (selectedPreset) setSelectedPreset({ ...selectedPreset, amount: 0 });
                }}
                className="w-full bg-surface-light text-text-bright rounded-xl pl-7 pr-3 py-3 outline-none font-bold text-lg min-h-[48px] focus:ring-2 focus:ring-primary"
              />
            </div>
          )}
          {selectedAccount && effectiveAmount > 0 && direction === 'subtract' && (
            <p className="text-xs text-text-dim mt-1.5">
              New balance: ${((selectedAccount.balance - effectiveAmount) / 100).toFixed(2)}
            </p>
          )}
        </div>

        {/* Date */}
        <div>
          <label className="block text-sm text-text-dim mb-2">Date</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-surface-light text-text-bright rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
          />
        </div>

        {/* Photos */}
        {direction === 'earn' && (
          <div>
            <label className="block text-sm text-text-dim mb-2">Photos (optional)</label>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setPhotos([...photos, { file: f, preview: URL.createObjectURL(f) }]);
                }
                if (fileRef.current) fileRef.current.value = '';
              }}
            />
            <div className="flex gap-2 flex-wrap">
              {photos.map((p, i) => (
                <div key={i} className="relative group">
                  <img src={p.preview} alt="Preview" className="w-20 h-20 object-cover rounded-xl" />
                  <button
                    type="button"
                    onClick={() => setPhotos(photos.filter((_, idx) => idx !== i))}
                    className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-surface-lighter border border-surface-lighter text-text-dim rounded-full text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-surface-light hover:text-text-bright"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 flex flex-col items-center justify-center gap-1 bg-surface-light rounded-xl text-text-dim text-xs hover:bg-surface-lighter transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Add
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={submitting || effectiveAmount <= 0 || !selectedKid || !effectiveReason}
          className={`w-full font-bold py-4 rounded-xl text-lg min-h-[56px] active:scale-95 transition-transform disabled:opacity-50 ${
            direction === 'subtract' ? 'bg-accent-red text-white' : 'bg-accent-green text-bg'
          }`}
        >
          {submitting
            ? 'Processing...'
            : effectiveAmount > 0
              ? `${direction === 'subtract' ? '−' : '+'} $${(effectiveAmount / 100).toFixed(2)}`
              : direction === 'subtract' ? 'Subtract' : 'Award'}
        </button>
      </div>
    </div>
  );
}
