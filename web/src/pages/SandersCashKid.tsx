import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type AccountWithMember, type FamilyMember, type TransactionWithNames } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { formatDate, useTimezone } from '../lib/timezone';

type Tab = 'history' | 'photos';

function getAge(birthday: string): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function formatTxnDate(dateStr: string, timezone: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return formatDate(date, timezone, { month: 'short', day: 'numeric' });
}

interface TxnPopupProps {
  txn: TransactionWithNames;
  onClose: () => void;
  onUpdated: () => void;
}

function TransactionPopup({ txn, onClose, onUpdated }: TxnPopupProps) {
  const timezone = useTimezone();
  const [editing, setEditing] = useState(false);
  const [reason, setReason] = useState(txn.reason);
  const [amountStr, setAmountStr] = useState((Math.abs(txn.amount) / 100).toFixed(2));
  const [photoUrl, setPhotoUrl] = useState(txn.photoUrl);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    setSaving(true);
    try {
      const newAmount = Math.round(parseFloat(amountStr) * 100) * (txn.amount < 0 ? -1 : 1);
      await api.put(`/api/sanders-cash/transactions/${txn.id}`, { amount: newAmount, reason, photoUrl });
      onUpdated();
      onClose();
    } catch {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/api/sanders-cash/transactions/${txn.id}`);
      onUpdated();
      onClose();
    } catch {
      setDeleting(false);
    }
  };

  const handlePhotoUpload = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.upload('/api/uploads', file);
      setPhotoUrl(result.url);
    } catch { /* ignore */ }
    setUploading(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">
            {txn.amount > 0 ? 'Award' : txn.type === 'spend' ? 'Redemption' : 'Adjustment'}
          </h3>
          <button onClick={onClose} className="text-text-dim text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
        </div>

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePhotoUpload(f); }} />

        {photoUrl ? (
          <div className="relative">
            <img src={photoUrl} alt="" className="w-full rounded-xl object-contain max-h-64" />
            {editing && (
              <button type="button" onClick={() => setPhotoUrl('')} className="absolute top-2 right-2 w-7 h-7 bg-accent-red text-white rounded-full text-xs flex items-center justify-center">×</button>
            )}
          </div>
        ) : editing ? (
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="flex items-center gap-2 px-4 py-3 bg-surface-light rounded-xl text-text-dim text-sm min-h-[48px] w-full">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
            {uploading ? 'Uploading...' : 'Add Photo'}
          </button>
        ) : null}

        {editing ? (
          <>
            <div>
              <label className="block text-sm text-text-dim mb-1">Reason</label>
              <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim font-bold">$</span>
                <input type="number" step="0.01" min="0.01" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} className="w-full bg-surface-light text-text-bright rounded-lg pl-7 pr-4 py-3 outline-none focus:ring-2 focus:ring-primary font-bold" />
              </div>
            </div>
            {photoUrl && !txn.photoUrl && (
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="text-primary-light text-sm font-medium min-h-[44px]">
                {uploading ? 'Uploading...' : 'Change Photo'}
              </button>
            )}
            <div className="flex gap-2">
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-3 rounded-xl text-text-dim font-medium min-h-[48px]">Cancel</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-text-bright text-lg">{txn.reason}</p>
            <div className="flex items-center justify-between">
              <span className={`font-bold text-2xl ${txn.amount > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {txn.amount > 0 ? '+' : ''}${(txn.amount / 100).toFixed(2)}
              </span>
              <span className="text-text-dim text-sm">
                {formatDate(new Date(txn.createdAt), timezone, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
              </span>
            </div>
            {txn.awardedByName && <p className="text-text-dim text-sm">By {txn.awardedByName}</p>}
            <button onClick={() => setEditing(true)} className="text-primary-light text-sm font-medium min-h-[44px]">Edit</button>
          </>
        )}

        <div className="pt-2 border-t border-surface-lighter">
          {confirmDelete ? (
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-dim">Delete this entry? Balance will be adjusted.</p>
              <div className="flex gap-2">
                <button onClick={handleDelete} disabled={deleting} className="text-accent-red text-sm font-medium px-3 py-2 min-h-[44px] disabled:opacity-50">
                  {deleting ? 'Deleting...' : 'Yes, Delete'}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="text-text-dim text-sm px-3 py-2 min-h-[44px]">Cancel</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)} className="text-accent-red text-sm px-1 py-2 min-h-[44px]">Delete Entry</button>
          )}
        </div>
      </div>
    </div>
  );
}

interface PhotoViewerProps {
  photos: TransactionWithNames[];
  startIndex: number;
  onClose: () => void;
}

function PhotoViewer({ photos, startIndex, onClose }: PhotoViewerProps) {
  const [index, setIndex] = useState(startIndex);
  const photo = photos[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
      else if (e.key === 'ArrowRight') setIndex((i) => Math.min(photos.length - 1, i + 1));
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [photos.length, onClose]);

  return (
    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="relative w-full h-full flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {index > 0 && (
          <button onClick={() => setIndex(index - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 bg-surface/80 text-text-bright w-12 h-12 rounded-full flex items-center justify-center text-xl z-10">‹</button>
        )}
        <div className="flex flex-col items-center gap-3 max-w-full max-h-full">
          <img src={photo.photoUrl} alt="" className="max-w-full max-h-[75vh] rounded-2xl object-contain" />
          <p className="text-text-bright text-center">{photo.reason}</p>
          <p className="text-text-dim text-sm">{index + 1} / {photos.length}</p>
        </div>
        {index < photos.length - 1 && (
          <button onClick={() => setIndex(index + 1)} className="absolute right-4 top-1/2 -translate-y-1/2 bg-surface/80 text-text-bright w-12 h-12 rounded-full flex items-center justify-center text-xl z-10">›</button>
        )}
        <button onClick={onClose} className="absolute top-4 right-4 bg-surface/80 text-text-bright w-10 h-10 rounded-full flex items-center justify-center text-lg">×</button>
      </div>
    </div>
  );
}

export function SandersCashKid() {
  const { memberId } = useParams<{ memberId: string }>();
  const navigate = useNavigate();
  const timezone = useTimezone();
  const [account, setAccount] = useState<AccountWithMember | null>(null);
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithNames[]>([]);
  const [tab, setTab] = useState<Tab>('history');
  const [selectedTxn, setSelectedTxn] = useState<TransactionWithNames | null>(null);
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);

  const loadData = useCallback(() => {
    if (!memberId) return;
    api.get<AccountWithMember>(`/api/sanders-cash/accounts/${memberId}`).then(setAccount).catch(() => {});
    api.get<FamilyMember>(`/api/family/${memberId}`).then(setMember).catch(() => {});
  }, [memberId]);

  const loadTransactions = useCallback(() => {
    if (!account) return;
    api.get<TransactionWithNames[]>(`/api/sanders-cash/transactions/${account.id}?limit=500`).then(setTransactions).catch(() => {});
  }, [account]);

  useEffect(loadData, [loadData]);
  useEffect(loadTransactions, [loadTransactions]);

  useWebSocket((msg) => {
    if (msg.type === 'sanders_cash_accounts' || msg.type === 'sanders_cash_transaction') {
      loadData();
      loadTransactions();
    }
  });

  const photosOnly = transactions.filter((t) => t.photoUrl);
  const age = member ? getAge(member.birthday) : null;

  if (!account) {
    return <p className="text-text-dim text-center py-8">Loading...</p>;
  }

  return (
    <div className="space-y-5">
      <button onClick={() => navigate('/sanders-cash')} className="text-primary-light text-sm font-medium min-h-[44px]">← Back</button>

      <div className="flex items-center gap-4">
        {member?.avatarUrl ? (
          <img src={member.avatarUrl} alt={account.memberName} className="w-16 h-16 rounded-full object-cover" />
        ) : (
          <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-bg" style={{ backgroundColor: account.memberColor }}>
            {account.memberName[0]}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-text-bright">{account.memberName}</h1>
          {age !== null && <p className="text-text-dim text-sm">Age {age}</p>}
          <p className="text-accent-green font-bold text-xl">${(account.balance / 100).toFixed(2)}</p>
        </div>
      </div>

      <div className="flex gap-1.5">
        <button onClick={() => setTab('history')} className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${tab === 'history' ? 'bg-primary text-white' : 'bg-surface text-text-dim'}`}>
          History
        </button>
        <button onClick={() => setTab('photos')} className={`px-4 py-2 rounded-xl text-sm font-medium min-h-[44px] transition-colors ${tab === 'photos' ? 'bg-primary text-white' : 'bg-surface text-text-dim'}`}>
          Photos{photosOnly.length > 0 ? ` (${photosOnly.length})` : ''}
        </button>
      </div>

      {tab === 'history' && (
        <div className="space-y-2">
          {transactions.map((txn) => (
            <button
              key={txn.id}
              onClick={() => setSelectedTxn(txn)}
              className="w-full flex items-center gap-3 bg-surface rounded-xl p-3 text-left hover:bg-surface-light active:scale-[0.99] transition-all"
            >
              {txn.photoUrl ? (
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0">
                  <img src={txn.photoUrl} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold shrink-0 ${txn.amount > 0 ? 'bg-accent-green/20 text-accent-green' : 'bg-accent-red/20 text-accent-red'}`}>
                  {txn.amount > 0 ? '+' : '-'}
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-text-bright text-sm font-medium truncate">{txn.reason}</p>
                <p className="text-text-dim text-xs">
                  {formatTxnDate(txn.createdAt, timezone)}
                  {txn.awardedByName && ` · ${txn.awardedByName}`}
                </p>
              </div>
              <span className={`font-bold text-sm shrink-0 ${txn.amount > 0 ? 'text-accent-green' : 'text-accent-red'}`}>
                {txn.amount > 0 ? '+' : ''}${(txn.amount / 100).toFixed(2)}
              </span>
            </button>
          ))}
          {transactions.length === 0 && <p className="text-text-dim text-center py-4 text-sm">No transactions yet</p>}
        </div>
      )}

      {tab === 'photos' && (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
          {photosOnly.map((txn, i) => (
            <button
              key={txn.id}
              onClick={() => setViewerIndex(i)}
              className="aspect-square rounded-xl overflow-hidden hover:opacity-90 active:scale-[0.97] transition-all"
            >
              <img src={txn.photoUrl} alt={txn.reason} className="w-full h-full object-cover" />
            </button>
          ))}
          {photosOnly.length === 0 && <p className="text-text-dim text-center py-4 text-sm col-span-full">No photos yet</p>}
        </div>
      )}

      {selectedTxn && (
        <TransactionPopup
          txn={selectedTxn}
          onClose={() => setSelectedTxn(null)}
          onUpdated={() => { loadData(); loadTransactions(); }}
        />
      )}

      {viewerIndex !== null && (
        <PhotoViewer
          photos={photosOnly}
          startIndex={viewerIndex}
          onClose={() => setViewerIndex(null)}
        />
      )}
    </div>
  );
}
