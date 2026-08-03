import { useEffect, useRef, useState } from 'react';
import { api, type FamilyMember } from '../../api/client';

const COLORS = ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7'];

function getAge(birthday: string): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

interface EditPopupProps {
  member: FamilyMember;
  onClose: () => void;
  onSaved: () => void;
}

function MemberEditPopup({ member, onClose, onSaved }: EditPopupProps) {
  const [name, setName] = useState(member.name);
  const [color, setColor] = useState(member.color);
  const [birthday, setBirthday] = useState(member.birthday || '');
  const [avatarPreview, setAvatarPreview] = useState(member.avatarUrl || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUploadAvatar = async (file: File) => {
    setUploading(true);
    try {
      const result = await api.upload('/api/uploads', file);
      setAvatarPreview(result.url);
    } catch { /* ignore */ }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/family/${member.id}`, {
        name,
        color,
        birthday,
        avatarUrl: avatarPreview,
      });
      onSaved();
      onClose();
    } catch {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl w-full max-w-md p-5 space-y-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">Edit {member.name}</h3>
          <button onClick={onClose} className="text-text-dim text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
        </div>

        <div className="flex flex-col items-center gap-2">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUploadAvatar(f); }} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="relative group">
            {avatarPreview ? (
              <img src={avatarPreview} alt={member.name} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-bg" style={{ backgroundColor: color }}>
                {name[0] || '?'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">{uploading ? '...' : 'Photo'}</span>
            </div>
          </button>
          {avatarPreview && (
            <button type="button" onClick={() => setAvatarPreview('')} className="text-accent-red text-xs">Remove photo</button>
          )}
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Name</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Birthday</label>
          <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} className="w-full bg-surface-light text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
          {birthday && <p className="text-text-dim text-xs mt-1">Age: {getAge(birthday)}</p>}
        </div>

        <div>
          <label className="block text-sm text-text-dim mb-1">Color</label>
          <div className="flex gap-2 flex-wrap">
            {COLORS.map((c) => (
              <button key={c} type="button" onClick={() => setColor(c)} className={`w-8 h-8 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />
            ))}
          </div>
        </div>

        <label className="flex items-center gap-3 py-1 opacity-50 cursor-not-allowed">
          <input type="checkbox" checked={false} disabled className="w-5 h-5" />
          <div>
            <span className="text-text-bright text-sm">Can Log In</span>
            <p className="text-text-dim text-xs">Not yet available</p>
          </div>
        </label>

        <button onClick={handleSave} disabled={saving || !name.trim()} className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </div>
  );
}

export function FamilyTab() {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
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
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" required />
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Role</label>
            <div className="flex gap-2">
              {(['kid', 'parent'] as const).map((r) => (
                <button key={r} type="button" onClick={() => setRole(r)} className={`flex-1 py-3 rounded-lg font-medium capitalize transition-colors min-h-[48px] ${role === r ? 'bg-primary text-white' : 'bg-surface-lighter text-text-dim'}`}>
                  {r}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-text-dim mb-1">Color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-10 h-10 rounded-full transition-transform ${color === c ? 'scale-125 ring-2 ring-white' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          {role === 'parent' && (
            <div>
              <label className="block text-sm text-text-dim mb-1">PIN (4-6 digits)</label>
              <input type="password" inputMode="numeric" pattern="[0-9]{4,6}" value={pin} onChange={(e) => setPin(e.target.value)} className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" maxLength={6} />
            </div>
          )}
          <button type="submit" className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] active:scale-95 transition-transform">
            Add {role === 'kid' ? 'Kid' : 'Parent'}
          </button>
        </form>
      )}

      <div className="space-y-2">
        {members.map((m) => (
          <div key={m.id} className="flex items-center gap-3 bg-surface-light rounded-xl p-3">
            {m.avatarUrl ? (
              <img src={m.avatarUrl} alt={m.name} className="w-12 h-12 rounded-full object-cover" />
            ) : (
              <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-bg" style={{ backgroundColor: m.color }}>
                {m.name[0]}
              </div>
            )}
            <div className="flex-1">
              <p className="text-text-bright font-medium">{m.name}</p>
              <p className="text-text-dim text-sm capitalize">
                {m.role}
                {m.birthday && ` · Age ${getAge(m.birthday)}`}
              </p>
            </div>
            <button onClick={() => setEditingMember(m)} className="text-primary-light text-sm px-3 py-2 min-h-[48px]">Edit</button>
            <button onClick={() => handleDelete(m.id)} className="text-accent-red text-sm px-3 py-2 min-h-[48px]">Remove</button>
          </div>
        ))}
        {members.length === 0 && (
          <p className="text-text-dim text-center py-4">No family members yet</p>
        )}
      </div>

      {editingMember && (
        <MemberEditPopup member={editingMember} onClose={() => setEditingMember(null)} onSaved={load} />
      )}
    </div>
  );
}
