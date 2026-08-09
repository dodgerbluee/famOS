import { useEffect, useState, useCallback } from 'react';
import { api, type ChoreTemplate, type FamilyMember } from '../api/client';
import { useCurrencyName } from '../hooks/useCurrencyName';

export function Chores() {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const currencyName = useCurrencyName();

  const kids = members.filter((m) => m.role === 'kid');

  const load = useCallback(() => {
    api.get<ChoreTemplate[]>('/api/chore-templates').then(setTemplates).catch(() => {});
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleComplete = (vikunjaTaskId: number) => {
    api.post(`/api/tasks/${vikunjaTaskId}/complete`, {}).then(() => load()).catch(() => {});
  };

  const handleUncomplete = (vikunjaTaskId: number) => {
    api.post(`/api/tasks/${vikunjaTaskId}/uncomplete`, {}).then(() => load()).catch(() => {});
  };

  const handleDelete = (id: string) => {
    api.delete(`/api/chore-templates/${id}`).then(() => load()).catch(() => {});
  };

  const isCompletedBy = (tmpl: ChoreTemplate, memberId: string) =>
    tmpl.tasks?.some((t) => t.memberId === memberId && t.done) ?? false;

  const getTaskId = (tmpl: ChoreTemplate, memberId: string) =>
    tmpl.tasks?.find((t) => t.memberId === memberId)?.vikunjaTaskId;

  const sharedTemplates = templates.filter((t) => t.isShared);
  const templatesByKid = kids.map((kid) => ({
    kid,
    templates: templates.filter((t) => !t.isShared && t.assignedMembers.includes(kid.id)),
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Chores</h1>
        <button
          onClick={() => { setEditingId(null); setShowForm(!showForm); }}
          className="bg-primary-light text-surface px-4 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform min-h-[44px]"
        >
          {showForm ? 'Cancel' : '+ Add Chore'}
        </button>
      </div>

      {showForm && (
        <ChoreForm
          kids={kids}
          editingTemplate={editingId ? templates.find((t) => t.id === editingId) : undefined}
          currencyName={currencyName}
          onSave={() => { setShowForm(false); setEditingId(null); load(); }}
          onCancel={() => { setShowForm(false); setEditingId(null); }}
        />
      )}

      {sharedTemplates.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">Everyone</h2>
          <div className="space-y-2">
            {sharedTemplates.map((tmpl) => (
              <ChoreRow
                key={tmpl.id}
                template={tmpl}
                kids={kids.filter((k) => tmpl.assignedMembers.includes(k.id))}
                currencyName={currencyName}
                isCompletedBy={isCompletedBy}
                getTaskId={getTaskId}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={() => { setEditingId(tmpl.id); setShowForm(true); }}
                onDelete={() => handleDelete(tmpl.id)}
              />
            ))}
          </div>
        </section>
      )}

      {templatesByKid.map(({ kid, templates: kidTemplates }) => kidTemplates.length > 0 && (
        <section key={kid.id}>
          <h2 className="text-sm font-semibold uppercase tracking-wide mb-3" style={{ color: kid.color }}>
            {kid.name}
          </h2>
          <div className="space-y-2">
            {kidTemplates.map((tmpl) => (
              <ChoreRow
                key={tmpl.id}
                template={tmpl}
                kids={[kid]}
                currencyName={currencyName}
                isCompletedBy={isCompletedBy}
                getTaskId={getTaskId}
                onComplete={handleComplete}
                onUncomplete={handleUncomplete}
                onEdit={() => { setEditingId(tmpl.id); setShowForm(true); }}
                onDelete={() => handleDelete(tmpl.id)}
              />
            ))}
          </div>
        </section>
      ))}

      {templates.length === 0 && !showForm && (
        <p className="text-text-dim text-center py-8">No chores yet. Tap "+ Add Chore" to get started.</p>
      )}
    </div>
  );
}

function ChoreRow({
  template, kids, currencyName, isCompletedBy, getTaskId, onComplete, onUncomplete, onEdit, onDelete,
}: {
  template: ChoreTemplate;
  kids: FamilyMember[];
  currencyName: string;
  isCompletedBy: (tmpl: ChoreTemplate, memberId: string) => boolean;
  getTaskId: (tmpl: ChoreTemplate, memberId: string) => number | undefined;
  onComplete: (vikunjaTaskId: number) => void;
  onUncomplete: (vikunjaTaskId: number) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const allDone = kids.length > 0 && kids.every((k) => isCompletedBy(template, k.id));

  return (
    <div className={`bg-surface rounded-xl p-4 transition-colors ${allDone ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="text-lg">{template.icon || '📋'}</span>
        <div className="flex-1 min-w-0">
          <p className={`text-text-bright font-medium ${allDone ? 'line-through text-text-dim' : ''}`}>{template.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-text-dim text-[11px] capitalize">{template.recurrence}</span>
            {template.rewardAmount > 0 && (
              <span className="text-accent-green text-[11px]">+{(template.rewardAmount / 100).toFixed(2)} {currencyName}</span>
            )}
            {template.isShared && (
              <span className="text-primary-light text-[11px]">Shared</span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {kids.map((kid) => {
            const done = isCompletedBy(template, kid.id);
            const taskId = getTaskId(template, kid.id);
            return (
              <button
                key={kid.id}
                onClick={() => {
                  if (!taskId) return;
                  done ? onUncomplete(taskId) : onComplete(taskId);
                }}
                disabled={!taskId}
                className="flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-90"
                style={{
                  backgroundColor: done ? kid.color : 'transparent',
                  border: `2px solid ${kid.color}`,
                  opacity: done ? 1 : taskId ? 0.4 : 0.2,
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
          className="text-text-dim hover:text-text-bright text-sm px-1 min-h-[44px] flex items-center"
        >
          ⋯
        </button>
      </div>

      {expanded && (
        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-surface-lighter">
          <button onClick={onEdit} className="text-primary-light text-xs font-medium min-h-[44px] flex items-center">Edit</button>
          <button onClick={onDelete} className="text-accent-red text-xs font-medium min-h-[44px] flex items-center">Delete</button>
        </div>
      )}
    </div>
  );
}

const CHORE_ICONS = ['📋', '🧹', '🛏️', '🧽', '🗑️', '🐕', '🍽️', '📚', '🧺', '🪴', '🚿', '🪥'];

function ChoreForm({
  kids, editingTemplate, currencyName, onSave, onCancel,
}: {
  kids: FamilyMember[];
  editingTemplate?: ChoreTemplate;
  currencyName: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(editingTemplate?.title || '');
  const [icon, setIcon] = useState(editingTemplate?.icon || '📋');
  const [assignedMembers, setAssignedMembers] = useState<string[]>(
    editingTemplate?.assignedMembers || kids.map((k) => k.id)
  );
  const [recurrence, setRecurrence] = useState(editingTemplate?.recurrence || 'daily');
  const [rewardAmount, setRewardAmount] = useState(editingTemplate?.rewardAmount || 0);
  const [saving, setSaving] = useState(false);

  const toggleMember = (id: string) => {
    setAssignedMembers((prev) =>
      prev.includes(id) ? prev.filter((m) => m !== id) : [...prev, id]
    );
  };

  const allSelected = kids.length > 0 && kids.every((k) => assignedMembers.includes(k.id));

  const handleSubmit = async () => {
    if (!title.trim() || assignedMembers.length === 0) return;
    setSaving(true);
    const body = {
      title: title.trim(),
      icon,
      assignedMembers,
      recurrence,
      rewardAmount,
    };
    try {
      if (editingTemplate) {
        await api.put(`/api/chore-templates/${editingTemplate.id}`, body);
      } else {
        await api.post('/api/chore-templates', body);
      }
      onSave();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl p-5 space-y-4">
      <h3 className="text-text-bright font-semibold">{editingTemplate ? 'Edit Chore' : 'New Chore'}</h3>

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
            onClick={() => setAssignedMembers(allSelected ? [] : kids.map((k) => k.id))}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              allSelected ? 'bg-primary-light/20 text-primary-light ring-1 ring-primary-light' : 'bg-surface-light text-text-dim'
            }`}
          >
            Everyone
          </button>
          {kids.map((kid) => (
            <button
              key={kid.id}
              onClick={() => toggleMember(kid.id)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px]"
              style={{
                backgroundColor: assignedMembers.includes(kid.id) ? kid.color + '33' : undefined,
                color: assignedMembers.includes(kid.id) ? kid.color : undefined,
                border: assignedMembers.includes(kid.id) ? `1px solid ${kid.color}` : undefined,
              }}
            >
              {kid.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Frequency</label>
          <select
            value={recurrence}
            onChange={(e) => setRecurrence(e.target.value)}
            className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none min-h-[44px]"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="once">One-time</option>
          </select>
        </div>
        <div>
          <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Reward ({currencyName})</label>
          <div>
            <input
              type="number"
              step="0.01"
              min={0}
              value={(rewardAmount / 100).toFixed(2)}
              onChange={(e) => setRewardAmount(Math.max(0, Math.round((parseFloat(e.target.value) || 0) * 100)))}
              className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary-light min-h-[44px]"
            />
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleSubmit}
          disabled={!title.trim() || assignedMembers.length === 0 || saving}
          className="bg-primary-light text-surface px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform min-h-[44px]"
        >
          {saving ? 'Saving...' : editingTemplate ? 'Update' : 'Create'}
        </button>
        <button onClick={onCancel} className="text-text-dim text-sm font-medium min-h-[44px]">Cancel</button>
      </div>
    </div>
  );
}
