import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, type FamilyMember } from '../../api/client';

const COLORS = ['#f38ba8', '#89b4fa', '#a6e3a1', '#f9e2af', '#f5c2e7', '#fab387', '#94e2d5', '#cba6f7'];
const PREVIEW_SIZE = 300;
const OUTPUT_SIZE = 256;

function getAge(birthday: string): number | null {
  if (!birthday) return null;
  const birth = new Date(birthday + 'T00:00:00');
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

function cropImageToBlob(
  image: HTMLImageElement,
  crop: { x: number; y: number; size: number },
  zoom: number,
  pan: { x: number; y: number },
): Promise<Blob | null> {
  return new Promise((resolve) => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) { resolve(null); return; }

    const aspect = image.width / image.height;
    let dw: number, dh: number;
    if (aspect > 1) { dw = PREVIEW_SIZE; dh = PREVIEW_SIZE / aspect; }
    else { dh = PREVIEW_SIZE; dw = PREVIEW_SIZE * aspect; }

    const zw = dw * zoom;
    const zh = dh * zoom;
    const ox = (PREVIEW_SIZE - zw) / 2 + pan.x;
    const oy = (PREVIEW_SIZE - zh) / 2 + pan.y;

    const sx = ((crop.x - ox) / zw) * image.width;
    const sy = ((crop.y - oy) / zh) * image.height;
    const ss = (crop.size / zw) * image.width;

    canvas.width = OUTPUT_SIZE;
    canvas.height = OUTPUT_SIZE;
    ctx.drawImage(image, sx, sy, ss, ss, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
    canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.9);
  });
}

interface CropModalProps {
  imageSrc: string;
  imageEl: HTMLImageElement;
  onUpload: (blob: Blob) => void;
  onClose: () => void;
  uploading: boolean;
}

function AvatarCropModal({ imageSrc, imageEl, onUpload, onClose, uploading }: CropModalProps) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  const aspect = imageEl.width / imageEl.height;
  const dw = aspect > 1 ? PREVIEW_SIZE : PREVIEW_SIZE * aspect;
  const dh = aspect > 1 ? PREVIEW_SIZE / aspect : PREVIEW_SIZE;

  const crop = useMemo(() => {
    const size = Math.min(dw, dh);
    return { x: (PREVIEW_SIZE - size) / 2, y: (PREVIEW_SIZE - size) / 2, size };
  }, [dw, dh]);

  const zoomBounds = useMemo(() => {
    const minZoom = Math.max(crop.size / dw, crop.size / dh, 0.5);
    return { min: minZoom, max: 3 };
  }, [crop, dw, dh]);

  const constrainPan = useCallback((p: { x: number; y: number }, z: number) => {
    const zw = dw * z;
    const zh = dh * z;
    const cx = (PREVIEW_SIZE - zw) / 2;
    const cy = (PREVIEW_SIZE - zh) / 2;
    const maxX = crop.x - cx;
    const minX = crop.x + crop.size - cx - zw;
    const maxY = crop.y - cy;
    const minY = crop.y + crop.size - cy - zh;
    return {
      x: Math.max(Math.min(minX, maxX), Math.min(p.x, Math.max(minX, maxX))),
      y: Math.max(Math.min(minY, maxY), Math.min(p.y, Math.max(minY, maxY))),
    };
  }, [dw, dh, crop]);

  useEffect(() => {
    setPan((p) => constrainPan(p, zoom));
  }, [zoom, constrainPan]);

  const handlePointerDown = (e: React.PointerEvent) => {
    setDragging(true);
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging) return;
    const newPan = { x: e.clientX - dragStart.current.x, y: e.clientY - dragStart.current.y };
    setPan(constrainPan(newPan, zoom));
  };

  const handlePointerUp = () => setDragging(false);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newZoom = Math.max(zoomBounds.min, Math.min(zoomBounds.max, zoom - e.deltaY * 0.002));
    setZoom(newZoom);
  };

  const zw = dw * zoom;
  const zh = dh * zoom;
  const imgLeft = (PREVIEW_SIZE - zw) / 2 + pan.x;
  const imgTop = (PREVIEW_SIZE - zh) / 2 + pan.y;

  const handleSave = async () => {
    const blob = await cropImageToBlob(imageEl, crop, zoom, pan);
    if (blob) onUpload(blob);
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-surface rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-text-bright">Adjust Photo</h3>
          <button onClick={onClose} disabled={uploading} className="text-text-dim text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center">×</button>
        </div>

        <div
          ref={containerRef}
          className="relative mx-auto rounded-xl overflow-hidden bg-black/30 select-none"
          style={{ width: PREVIEW_SIZE, height: PREVIEW_SIZE, cursor: dragging ? 'grabbing' : 'grab', touchAction: 'none' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onWheel={handleWheel}
        >
          <img
            src={imageSrc}
            alt="Crop preview"
            draggable={false}
            className="absolute pointer-events-none"
            style={{ left: imgLeft, top: imgTop, width: zw, height: zh, objectFit: 'contain' }}
          />
          <div
            className="absolute rounded-full pointer-events-none"
            style={{
              left: crop.x,
              top: crop.y,
              width: crop.size,
              height: crop.size,
              boxShadow: '0 0 0 9999px rgba(0,0,0,0.55)',
              border: '2px solid rgba(255,255,255,0.7)',
            }}
          />
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-text-dim font-medium">Zoom</label>
            <span className="text-sm text-primary font-semibold">{Math.round(zoom * 100)}%</span>
          </div>
          <input
            type="range"
            min={zoomBounds.min}
            max={zoomBounds.max}
            step={0.05}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="w-full accent-primary"
          />
          <p className="text-text-dim text-xs mt-1">Drag to reposition. Scroll or slide to zoom.</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={handleSave}
            disabled={uploading}
            className="flex-1 bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50"
          >
            {uploading ? 'Uploading...' : 'Save Avatar'}
          </button>
          <button onClick={onClose} disabled={uploading} className="px-4 py-3 rounded-xl text-text-dim font-medium min-h-[48px]">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
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
  const [username, setUsername] = useState(member.username || '');
  const [password, setPassword] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdult = member.role === 'admin' || member.role === 'parent';

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropImg, setCropImg] = useState<HTMLImageElement | null>(null);

  const handleFileSelect = (file: File) => {
    if (file.type && !file.type.startsWith('image/')) return;
    if (file.size > 10 * 1024 * 1024) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const src = e.target?.result as string;
      const img = new Image();
      img.onload = () => {
        setCropSrc(src);
        setCropImg(img);
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  };

  const handleCroppedUpload = async (blob: Blob) => {
    setUploading(true);
    try {
      const file = new File([blob], 'avatar.jpg', { type: 'image/jpeg' });
      const result = await api.upload('/api/uploads', file);
      setAvatarPreview(result.url);
      setCropSrc(null);
      setCropImg(null);
    } catch { /* ignore */ }
    setUploading(false);
  };

  const closeCropper = () => {
    if (uploading) return;
    setCropSrc(null);
    setCropImg(null);
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const payload: Record<string, unknown> = {
        name,
        color,
        birthday,
        avatarUrl: avatarPreview,
      };
      if (isAdult) {
        payload.username = username.trim();
        if (password) payload.password = password;
        if (!member.canLogin && (!username.trim() || !password)) {
          setError('Username and password are required so this adult can sign in.');
          setSaving(false);
          return;
        }
      }
      await api.put(`/api/family/${member.id}`, payload);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
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
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFileSelect(f); if (fileRef.current) fileRef.current.value = ''; }} />
          <button type="button" onClick={() => fileRef.current?.click()} className="relative group">
            {avatarPreview ? (
              <img src={avatarPreview} alt={member.name} className="w-20 h-20 rounded-full object-cover" />
            ) : (
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-3xl font-bold text-bg" style={{ backgroundColor: color }}>
                {name[0] || '?'}
              </div>
            )}
            <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <span className="text-white text-xs font-medium">Photo</span>
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

        {isAdult && (
          <div className="space-y-3 bg-surface-light rounded-xl p-4">
            <div>
              <p className="text-text-bright text-sm font-medium">Sign-in</p>
              <p className="text-text-dim text-xs mt-0.5">
                {member.canLogin ? 'This adult can sign in on their own device.' : 'Set a username and password so they can sign in.'}
              </p>
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="off" className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-sm text-text-dim mb-1">{member.canLogin ? 'New password (optional)' : 'Password'}</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
            </div>
          </div>
        )}

        {error && <p className="text-accent-red text-sm">{error}</p>}

        <button onClick={handleSave} disabled={saving || !name.trim()} className="w-full bg-accent-green text-bg font-bold py-3 rounded-xl min-h-[48px] disabled:opacity-50">
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {cropSrc && cropImg && (
        <AvatarCropModal
          imageSrc={cropSrc}
          imageEl={cropImg}
          onUpload={handleCroppedUpload}
          onClose={closeCropper}
          uploading={uploading}
        />
      )}
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
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [formError, setFormError] = useState('');

  const load = () => {
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  };

  useEffect(load, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      await api.post('/api/family', {
        name,
        role,
        color,
        username: role === 'parent' ? username.trim() : undefined,
        password: role === 'parent' ? password : undefined,
      });
      setName('');
      setUsername('');
      setPassword('');
      setShowForm(false);
      load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not add member');
    }
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
            <>
              <div>
                <label className="block text-sm text-text-dim mb-1">Username</label>
                <input type="text" value={username} onChange={(e) => setUsername(e.target.value)} required autoComplete="off" className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
              </div>
              <div>
                <label className="block text-sm text-text-dim mb-1">Password</label>
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" className="w-full bg-surface-lighter text-text-bright rounded-lg px-4 py-3 outline-none focus:ring-2 focus:ring-primary" />
                <p className="text-text-dim text-xs mt-1">They’ll sign in with this on their own phone or computer.</p>
              </div>
            </>
          )}
          {formError && <p className="text-accent-red text-sm">{formError}</p>}
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
                {m.role === 'admin' ? 'adult (admin)' : m.role}
                {m.canLogin ? ' · can sign in' : ''}
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
