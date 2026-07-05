import { useEffect, useState, useCallback } from 'react';
import { api, type Chore, type FamilyMember } from '../../api/client';
import { useWebSocket } from '../../hooks/useWebSocket';

export function ChoresWidget() {
  const [chores, setChores] = useState<Chore[]>([]);
  const [members, setMembers] = useState<FamilyMember[]>([]);

  const load = useCallback(() => {
    api.get<Chore[]>('/api/chores').then(setChores).catch(() => {});
    api.get<FamilyMember[]>('/api/family').then(setMembers).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  useWebSocket((msg) => {
    if (msg.type === 'chores_updated') setChores(msg.payload as Chore[]);
  });

  const kids = members.filter((m) => m.role === 'kid');
  const totalSlots = chores.reduce((sum, c) => sum + (c.assignedTo ? 1 : kids.length), 0);
  const doneSlots = chores.reduce((sum, c) => {
    if (c.assignedTo) return sum + (c.completions.length > 0 ? 1 : 0);
    return sum + kids.filter((k) => c.completions.some((comp) => comp.completedBy === k.id)).length;
  }, 0);

  const handleToggle = (choreId: string, memberId: string, done: boolean) => {
    if (done) {
      api.post(`/api/chores/${choreId}/uncomplete`, { memberId }).then(() => load()).catch(() => {});
    } else {
      api.post(`/api/chores/${choreId}/complete`, { completedBy: memberId }).then(() => load()).catch(() => {});
    }
  };

  if (chores.length === 0) {
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
          {chores.map((chore) => {
            const relevantKids = chore.assignedTo ? kids.filter((k) => k.id === chore.assignedTo) : kids;
            const allDone = relevantKids.length > 0 && relevantKids.every((k) => chore.completions.some((c) => c.completedBy === k.id));

            return (
              <div key={chore.id} className="flex items-center gap-2 py-1">
                <span className="text-sm">{chore.icon || '📋'}</span>
                <span className={`text-sm flex-1 truncate ${allDone ? 'line-through text-text-dim' : 'text-text-bright'}`}>
                  {chore.title}
                </span>
                <div className="flex items-center gap-1">
                  {relevantKids.map((kid) => {
                    const done = chore.completions.some((c) => c.completedBy === kid.id);
                    return (
                      <button
                        key={kid.id}
                        onClick={() => handleToggle(chore.id, kid.id, done)}
                        className="w-6 h-6 rounded-full flex items-center justify-center transition-all active:scale-90"
                        style={{
                          backgroundColor: done ? kid.color : 'transparent',
                          border: `2px solid ${kid.color}`,
                          opacity: done ? 1 : 0.35,
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
