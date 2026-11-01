import { useEffect, useState } from 'react';
import { api, type FamilyMember, type VikunjaTaskSimple } from '../api/client';
import { useAuth } from '../contexts/AuthContext';

export function Tasks() {
  const { user, hasPermission } = useAuth();
  const [tasks, setTasks] = useState<VikunjaTaskSimple[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [selectedMemberId, setSelectedMemberId] = useState(user?.role === 'kiosk' ? '' : user?.memberId || '');
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const adults = members.filter((m) => m.role === 'admin' || m.role === 'parent');
  const canManage = hasPermission('tasks.manage');
  const effectiveMemberId = selectedMemberId || (user?.role === 'kiosk' ? adults[0]?.id || '' : user?.memberId || '');

  useEffect(() => {
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => {
    if (!effectiveMemberId) return;
    let cancelled = false;
    const q = `?memberId=${encodeURIComponent(effectiveMemberId)}`;
    api.get<VikunjaTaskSimple[]>(`/api/tasks${q}`)
      .then((next) => { if (!cancelled) setTasks(next); })
      .catch(() => { if (!cancelled) setTasks([]); });
    return () => { cancelled = true; };
  }, [effectiveMemberId, refreshKey]);

  const load = () => setRefreshKey((key) => key + 1);

  const handleSubmit = async () => {
    if (!title.trim() || !effectiveMemberId) return;
    setSaving(true);
    try {
      await api.post('/api/tasks', {
        title: title.trim(),
        dueDate: dueDate || undefined,
        memberId: effectiveMemberId,
      });
      setTitle('');
      setDueDate('');
      setShowForm(false);
      load();
    } catch {
      setSaving(false);
    }
  };

  const handleToggle = async (taskId: number, done: boolean) => {
    try {
      if (done) {
        await api.post(`/api/tasks/${taskId}/uncomplete`, {});
      } else {
        await api.post(`/api/tasks/${taskId}/complete`, {});
      }
      load();
    } catch { /* ignore */ }
  };

  const pending = tasks.filter((t) => !t.done);
  const completed = tasks.filter((t) => t.done);

  return (
    <div className="space-y-6 p-[var(--page-gutter)]">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-bold text-text-bright">Tasks</h1>
          <p className="text-text-dim text-sm mt-0.5">Each adult has their own list. Kids' to-dos live on Chores.</p>
        </div>
        {canManage && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-primary-light text-surface px-4 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform min-h-[44px] shrink-0"
          >
            {showForm ? 'Cancel' : '+ Add Task'}
          </button>
        )}
      </div>

      {adults.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {adults.map((member) => (
            <button
              key={member.id}
              onClick={() => setSelectedMemberId(member.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
                effectiveMemberId === member.id ? '' : 'bg-surface-light text-text-dim'
              }`}
              style={effectiveMemberId === member.id ? {
                backgroundColor: member.color + '33',
                color: member.color,
                border: `1px solid ${member.color}`,
              } : undefined}
            >
              {member.name}
            </button>
          ))}
        </div>
      )}

      {showForm && canManage && (
        <div className="bg-surface rounded-xl p-5 space-y-4">
          <h3 className="text-text-bright font-semibold">New Task</h3>
          <div>
            <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fix the fence"
              className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary-light"
            />
          </div>
          <div>
            <label className="text-text-dim text-xs uppercase tracking-wide block mb-1">Due Date (optional)</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full bg-surface-light text-text-bright rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary-light"
            />
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSubmit}
              disabled={!title.trim() || saving}
              className="bg-primary-light text-surface px-5 py-2 rounded-xl text-sm font-medium disabled:opacity-50 active:scale-95 transition-transform min-h-[44px]"
            >
              {saving ? 'Saving...' : 'Create'}
            </button>
            <button onClick={() => setShowForm(false)} className="text-text-dim text-sm font-medium min-h-[44px]">Cancel</button>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 min-[1100px]:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
        {pending.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-dim">To Do</h2>
            <div className="space-y-2">
              {pending.map((task) => <TaskRow key={task.id} task={task} onToggle={handleToggle} />)}
            </div>
          </section>
        )}

        {completed.length > 0 && (
          <section>
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-text-dim">Done</h2>
            <div className="space-y-2">
              {completed.map((task) => <TaskRow key={task.id} task={task} onToggle={handleToggle} />)}
            </div>
          </section>
        )}
      </div>

      {tasks.length === 0 && !showForm && (
        <p className="text-text-dim text-center py-8">
          {canManage ? 'No tasks yet. Tap "+ Add Task" to get started.' : 'No tasks for this family member.'}
        </p>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: VikunjaTaskSimple; onToggle: (id: number, done: boolean) => void }) {
  const formatDue = (dateStr?: string) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const now = new Date();
    const isOverdue = d < now && !task.done;
    const formatted = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return { text: formatted, overdue: isOverdue };
  };

  const due = formatDue(task.dueDate);

  return (
    <div className={`bg-surface rounded-xl p-4 transition-colors ${task.done ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => onToggle(task.id, task.done)}
          className="flex items-center justify-center w-8 h-8 rounded-full transition-all active:scale-90 shrink-0"
          style={{
            backgroundColor: task.done ? 'var(--color-accent-green)' : 'transparent',
            border: `2px solid ${task.done ? 'var(--color-accent-green)' : 'var(--color-text-dim)'}`,
          }}
        >
          {task.done && <span className="text-white text-xs font-bold">✓</span>}
        </button>

        <div className="flex-1 min-w-0">
          <p className={`text-text-bright font-medium ${task.done ? 'line-through text-text-dim' : ''}`}>{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            {task.priority >= 3 && (
              <span className="text-accent-red text-[11px] font-medium">High Priority</span>
            )}
            {due && (
              <span className={`text-[11px] ${due.overdue ? 'text-accent-red font-medium' : 'text-text-dim'}`}>
                {due.overdue ? 'Overdue: ' : 'Due: '}{due.text}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
