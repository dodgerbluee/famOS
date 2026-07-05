import { useEffect, useState, useCallback } from 'react';
import { api, type Chore, type FamilyMember } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';

export function Chores() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const kids = members.filter((m) => m.role === 'kid');

  const load = useCallback(() => {
    api.get<Chore[]>('/api/chores').then(setChores).catch(() => {});
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useWebSocket((msg) => {
    if (msg.type === 'chores_updated') setChores(msg.payload as Chore[]);
  });

  const handleComplete = (choreId: string, memberId: string) => {
    api.post(`/api/chores/${choreId}/complete`, { completedBy: memberId }).then(() => load()).catch(() => {});
  };

  const handleUncomplete = (choreId: string, memberId: string) => {
    api.post(`/api/chores/${choreId}/uncomplete`, { memberId }).then(() => load()).catch(() => {});
  };

  const handleDelete = (id: string) => {
    api.delete(`/api/chores/${id}`).then(() => load()).catch(() => {});
  };

  const isCompletedBy = (chore: Chore, memberId: string) =>
    chore.completions.some((c) => c.completedBy === memberId);

  const sharedChores = chores.filter((c) => !c.assignedTo);
  const choresByKid = kids.map((kid) => ({
    kid,
    chores: chores.filter((c) => c.assignedTo === kid.id),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Chores</h1>
        <button
          onClick={() => { setEditingId(null); setShowForm(!showForm); }}
          className="bg-primary-light text-surface px-4 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform"
        >
          {showForm ? 'Cancel' : '+ Add Chore'}
        </button>
      </div>

      {showForm && (
        <ChoreForm
          kids={kids}
          editingChore={editingId ? chores.find((c) => c.id === editingId) : undefined}
          onSave={() => { setShowForm(false); setEditingId(null); load(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {/* Shared chores */}
      {sharedChores.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">Everyone</h2>
          <div className="space-y-2">
            {sharedChores.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                kids={kids}
                isCompletedBy={isCompletedBy}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={() => { setEditingId(chore.id); setShowForm(true); }}
                onDelete={() => handleDelete(chore.id)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Per-kid chores */}
      {choresByKid.map(({ kid, chores: kidChores }) => kidChores.length > 0 && (
        <section key={kid.id}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: kid.color }}>
            {kid.name}
          </h2>
          <div className="space-y-2">
            {kidChores.map((chore) => (
              <ChoreRow
                key={chore.id}
                chore={chore}
                kids={[kid]}
                isCompletedBy={isCompletedBy}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={() => { setEditingId(chore.id); setShowForm(true); }}
                onDelete={() => handleDelete(chore.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {chores.length === 0 && !showForm && (
        <p className="text-text-dim text-center py-8">No chores yet. Tap "+ Add Chore" to get started.</p>
      )}
    </div>
  );
}

function ChoreRow({
  chore, kids, isCompletedBy, onComplete, onUncomplete, onEdit, onDelete,
}: {
  chore: Chore;
  kids: FamilyMember[];
  isCompletedBy: (chore: Chore, memberId: string) => boolean;
  onComplete: (choreId: string, memberId: string) => void;
  onUncomplete: (choreId: string, memberId: string) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allDone = kids.length > 0 && kids.every((k) => isCompletedBy(chore, k.id));

  return (
    <div className={`bg-surface rounded-xl p-4 transition-colors ${allDone ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{chore.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-text-bright font-medium ${allDone ? 'line-through text-text-dim' : ''}`}>{chore.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-text-dim text-[11px] capitalize">{chore.recurrence}</span>
            {chore.rewardAmount > 0 && (
              <span className="text-accent-green text-[11px]">+{chore.rewardAmount} SC</span>
            )}
          </div>
        </div>

        {/* Completion toggles per kid */}
        <div className="flex items-center gap-1.5">
          {kids.map((kid) => {
            const done = isCompletedBy(chore, kid.id);
            return (
              <button
                key={kid.id}
                onClick={() => done ? onUncomplete(chore.id, kid.id) : onComplete(chore.id, kid.id)}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-90"
                style={{
                  backgroundColor: done ? kid.color : 'transparent',
                  border: `2px solid ${kid.color}`,
                  opacity: done ? 1 : 0.4,
                }}
                title={`${kid.name}: ${done ? 'Done' : 'Not done'}`}
              >
                {done && <span className="text-white text-xs font-bold">✓</span>}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setExpanded(!expanded)}
          className="text-text-dim hover:text-text-bright text-sm px-1"
        >
          ⋯
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-lighter">
          <button onClick={onEdit} className="text-primary-light text-xs font-medium">Edit</button>
          <button onClick={onDelete} className="text-accent-red text-xs font-medium">Delete</button>
          {chore.completions.length > 0 && (
            <span className="text-text-dim text-xs ml-auto">
              Done by: {chore.completions.map((c) => c.completedName).join(', ')}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

const CHORE_ICONS = ['📋', '🧹', '🛏️', '🧽', '🗑️', '🐕', '🍽️', '📚', '🧺', '🪴', '🚿', '🪥'];

function ChoreForm({
  kids, editingChore, onSave, onCancel,
}: {
  kids: FamilyMember[];
  editingChore?: Chore;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editingChore?.title || '');
  const [icon, setIcon] = useState(editingChore?.icon || '📋');
  const [assignedTo, setAssignedTo] = useState<string>(editingChore?.assignedTo || '');
  const [recurrence, setRecurrence] = useState(editingChore?.recurrence || 'daily');
  const [rewardAmount, setRewardAmount] = useState(editingChore?.rewardAmount || 0);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      icon,
      assignedTo: assignedTo || null,
      recurrence,
      rewardAmount,
    };
    try {
      if (editingChore) {
        await api.put(`/api/chores/${editingChore.id}`, body);
      } else {
        await api.post('/api/chores', body);
      }
      onSave();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl p-5 space-y-4">
      <h3 className="text-text-bright font-semibold">{editingChore ? 'Edit Chore' : 'New Chore'}</h3>

      <div>
        <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Title</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Make your bed"
          className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary-light"
        />
      </div>

      <div>
        <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Icon</label>
        <div className="flex flex-wrap gap-2">
          {CHORE_ICONS.map((i) => (
            <button
              key={i}
              onClick={() => setIcon(i)}
              className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center transition-colors ${
                icon === i ? 'bg-primary-light/20 ring-1 ring-primary-light' : 'bg-surface-light'
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Assign To</label>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setAssignedTo('')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              !assignedTo ? 'bg-primary-light/20 text-primary-light ring-1 ring-primary-light' : 'bg-surface-light text-text-dim'
            }`}
          >
            Everyone
          </button>
          {kids.map((kid) => (
            <button
              key={kid.id}
              onClick={() => setAssignedTo(kid.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
              style={{
                backgroundColor: assignedTo === kid.id ? kid.color + '33' : undefined,
                color: assignedTo === kid.id ? kid.color : undefined,
                border: assignedTo === kid.id ? `1px solid ${kid.color}` : undefined,
              }}
            >
              {kid.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Frequency</label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="once">One-time</option>
          </select>
        </div>
        <div>
          <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Reward (SC)</label>
          <input
            type="number"
            min={0}
            value={rewardAmount}
            onChange={(e) => setRewardAmount(Math.max(0, parseInt(e.target.value) || 0))}
            className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary-light"
          />
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || saving}
          className="bg-primary-light text-surface px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform"
        >
          {saving ? 'Saving...' : editingChore ? 'Update' : 'Create'}
        </button>
        <button onClick={onCancel} className="text-text-dim text-sm font-medium">Cancel</button>
      </div>
    </div>
  );
}
