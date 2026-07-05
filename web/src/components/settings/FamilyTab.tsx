import { useEffect, useState } from 'react';
import { api, type FamilyMember } from '../../api/client';

const COLORS = ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7'];

export function FamilyTab() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [role, setRole] = useState<'parent' | 'kid'>('kid');
  const [color, setColor] = useState(COLORS[0]);
  const [pin, setPin] = useState('');

  const load = () => {
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await api.post('/api/family', { name, role, color, pin: pin || undefined });
    setName('');
    setPin('');
    setShowForm(false);
    load();
  };

  const handleDelete = async (id: string) => {
    await api.delete(`/api/family/${id}`);
    load();
  };

  return (
    <div className="bg-surface rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-text-bright">Family Members</h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary text-white px-4 py-2 rounded-xl font-medium min-h-[48px] active:scale-95 transition-transform"
        >
          {showForm ? 'Cancel' : 'Add Member'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-4 mb-6 bg-surface-light rounded-xl p-4">
          <div>
            <label className="block text-sm text-text-dim mb-1">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">Role</label>
            <div className="flex gap-2">
              {(['kid', 'parent'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={`flex-1 py-3 rounded-lg font-medium capitalize transition-colors min-h-[48px] ${
                    role === r ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm text-text-dim mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-10 h-10 rounded-full transition-transform ${
                    color === c ? 'scale-125 ring-2 ring-white' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {role === 'parent' && (
            <div>
              <label className="block text-sm text-text-dim mb-1">PIN (4-6 digits)</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="[0-9]{4,6}"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary"
                maxLength={6}
              />
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform"
          >
            Add {role === 'kid' ? 'Kid' : 'Parent'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div
            key={m.id}
            className="flex items-center gap-3 bg-surface-light rounded-xl p-3"
          >
            <div
              className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-bg"
              style={{ backgroundColor: m.color }}
            >
              {m.name[0]}
            </div>
            <div className="flex-1">
              <p className="text-text-bright font-medium">{m.name}</p>
              <p className="text-text-dim text-sm capitalize">{m.role}</p>
            </div>
            <button
              onClick={() => handleDelete(m.id)}
              className="text-accent-red text-sm px-3 py-2 min-h-[48px] min-w-[48px] flex items-center justify-center"
            >
              Remove
            </button>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-text-dim text-center py-4">No family members yet</p>
        )}
      </div>
    </div>
  );
}
