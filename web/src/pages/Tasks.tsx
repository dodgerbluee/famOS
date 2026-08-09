import { useEffect, useState, useCallback } from 'react';
import { api, type VikunjaTaskSimple } from '../api/client';

export function Tasks() {
  const [tasks, setTasks] = useState<VikunjaTaskSimple[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    api.get<VikunjaTaskSimple[]>('/api/tasks').then(setTasks).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async () => {
    if (!title.trim()) return;
    setSaving(true);
    try {
      await api.post('/api/tasks', { title: title.trim(), dueDate: dueDate || undefined });
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-bright">Tasks</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-primary-light text-surface px-4 py-2 rounded-xl text-sm font-medium active:scale-95 transition-transform min-h-[44px]"
        >
          {showForm ? 'Cancel' : '+ Add Task'}
        </button>
      </div>

      {showForm && (
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

      {pending.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">To Do</h2>
          <div className="space-y-2">
            {pending.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={handleToggle} />
            ))}
          </div>
        </section>
      )}

      {completed.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-text-dim uppercase tracking-wide mb-3">Done</h2>
          <div className="space-y-2">
            {completed.map((task) => (
              <TaskRow key={task.id} task={task} onToggle={handleToggle} />
            ))}
          </div>
        </section>
      )}

      {tasks.length === 0 && !showForm && (
        <p className="text-text-dim text-center py-8">No tasks yet. Tap "+ Add Task" to get started.</p>
      )}
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: VikunjaTaskSimple; onToggle: (id: number, done: boolean) => void }) {
  const formatDue = (dateStr: string) => {
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
