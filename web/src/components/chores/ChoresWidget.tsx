import { useEffect, useState, useCallback } from 'react';
import { api, type ChoreTemplate, type FamilyMember } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export function ChoresWidget() {
  const [templates, setTemplates] = useState<ChoreTemplate[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const load = useCallback(() => {
    api.get<ChoreTemplate[]>('/api/chore-templates').then(setTemplates).catch(() => {});
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useWebSocket((msg) => {
    if (msg.type === 'chore_templates_updated') load();
  });

  const kids = members.filter((m) => m.role === 'kid');
  const visible = templates.filter((t) =>
    t.assignedMembers.some((id) => kids.some((k) => k.id === id))
  );

  const isCompletedBy = (tmpl: ChoreTemplate, memberId: string) =>
    tmpl.tasks?.some((t) => t.memberId === memberId && t.done) ?? false;

  const getTaskId = (tmpl: ChoreTemplate, memberId: string) =>
    tmpl.tasks?.find((t) => t.memberId === memberId)?.vikunjaTaskId;

  const totalSlots = visible.reduce((sum, t) => {
    return sum + kids.filter((k) => t.assignedMembers.includes(k.id)).length;
  }, 0);
  const doneSlots = visible.reduce((sum, t) => {
    return sum + kids.filter((k) => t.assignedMembers.includes(k.id) && isCompletedBy(t, k.id)).length;
  }, 0);

  const handleToggle = (e: React.MouseEvent, taskId: number | undefined, done: boolean) => {
    e.stopPropagation();
    if (!taskId) return;
    const path = done ? `/api/tasks/${taskId}/uncomplete` : `/api/tasks/${taskId}/complete`;
    api.post(path, {}).then(() => load()).catch(() => {});
  };

  if (visible.length === 0) {
    return (
      <div>
        <h2 className="text-lg font-semibold text-text-bright mb-2">Chores</h2>
        <p className="text-text-dim text-sm">No chores set up yet</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold text-text-bright">Chores</h2>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
          doneSlots === totalSlots && totalSlots > 0
            ? 'bg-accent-green/15 text-accent-green'
            : 'bg-surface-lighter text-text-dim'
        }`}>
          {doneSlots}/{totalSlots}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 pr-1">
        <div className="space-y-1.5">
          {visible.map((tmpl) => {
            const relevantKids = kids.filter((k) => tmpl.assignedMembers.includes(k.id));
            const allDone = relevantKids.length > 0 && relevantKids.every((k) => isCompletedBy(tmpl, k.id));

            return (
              <div key={tmpl.id} className="flex items-center gap-2 py-1">
                <span className="text-sm">{tmpl.icon || '📋'}</span>
                <span className={`text-sm flex-1 truncate ${allDone ? 'line-through text-text-dim' : 'text-text-bright'}`}>
                  {tmpl.title}
                </span>
                <div className="flex items-center gap-1">
                  {relevantKids.map((kid) => {
                    const done = isCompletedBy(tmpl, kid.id);
                    const taskId = getTaskId(tmpl, kid.id);
                    return (
                      <button
                        key={kid.id}
                        onClick={(e) => handleToggle(e, taskId, done)}
                        disabled={!taskId}
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                        style={{
                          backgroundColor: done ? kid.color : 'transparent',
                          border: `2px solid ${kid.color}`,
                          opacity: done ? 1 : taskId ? 0.35 : 0.2,
                        }}
                        title={kid.name}
                      >
                        {done && <span className="text-white text-[9px] font-bold">✓</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
