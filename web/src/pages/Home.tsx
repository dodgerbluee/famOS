import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import type { ShellContext } from '../components/layout/Shell';
import { api, type AccountWithMember, type CalendarEvent } from '../api/client';
import { useWebSocket } from '../hooks/useWebSocket';
import { Leaderboard } from '../components/sanders-cash/Leaderboard';
import { DayView } from '../components/calendar/DayView';
import { WeekView } from '../components/calendar/WeekView';
import { MonthAgendaView } from '../components/calendar/MonthAgendaView';
import { DailyBriefingCard } from '../components/ai/DailyBriefing';
import { WeatherCard } from '../components/weather/WeatherCard';
import { GatusWidget } from '../components/integrations/GatusWidget';
import { SeerrWidget } from '../components/integrations/SeerrWidget';
import { VikunjaWidget } from '../components/integrations/VikunjaWidget';
import { ChoresWidget } from '../components/chores/ChoresWidget';
import { DashboardGrid } from '../components/dashboard/DashboardGrid';
import { GridCard } from '../components/dashboard/GridCard';
import {
  type DashboardLayout,
  DEFAULT_GRID_LAYOUT, migrateLayout, findEmptySlot,
  CARD_MIN_SIZES,
} from '../lib/gridLayout';
import { eventSpansDate } from '../lib/calendar';
import { addDaysInTimezone, addMonthsInTimezone, endOfMonthInTimezone, formatDate, formatTime, getDateKey, getHour, startOfMonthInTimezone, startOfWeekInTimezone, useTimezone } from '../lib/timezone';

interface CardDef {
  id: string;
  label: string;
  icon: string;
}

  const CARD_DEFS: CardDef[] = [
  { id: 'briefing', label: 'Briefing', icon: '✦' },
  { id: 'day-calendar', label: 'Day', icon: '◫' },
  { id: 'week-calendar', label: 'Week', icon: '◫' },
  { id: 'month-calendar', label: 'Month', icon: '◫' },
  { id: 'chores', label: 'Chores', icon: '✓' },
  { id: 'tasks', label: 'Tasks', icon: '☐' },
  { id: 'services', label: 'Services', icon: '◉' },
  { id: 'media', label: 'Media', icon: '▶' },
  { id: 'sanders-cash', label: 'Sanders Cash', icon: '◈' },
  { id: 'weather', label: 'Weather', icon: '☀' },
];

export function Home() {
  const [accounts, setAccounts] = useState<AccountWithMember[]>([]);
  const [scheduleEvents, setScheduleEvents] = useState<CalendarEvent[]>([]);
  const [now, setNow] = useState(new Date());
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_GRID_LAYOUT);
  const { editing, setEditing } = useOutletContext<ShellContext>();
  const layoutSnapshotRef = useRef<DashboardLayout | null>(null);
  const [serviceStatus, setServiceStatus] = useState<{ failing: number; unstable: number }>({ failing: 0, unstable: 0 });
  const [mediaPending, setMediaPending] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const timezone = useTimezone();

  const viewDay = addDaysInTimezone(now, dayOffset, timezone);

  const viewWeekStart = addDaysInTimezone(startOfWeekInTimezone(now, timezone), weekOffset * 7, timezone);
  const viewMonth = addMonthsInTimezone(now, monthOffset, timezone);

  const loadAccounts = useCallback(() => {
    api.get<AccountWithMember[]>('/api/sanders-cash/accounts').then(setAccounts).catch(() => {});
  }, []);

  const loadScheduleEvents = useCallback(() => {
    const current = new Date();
    const rangeStart = monthOffset < 0
      ? startOfMonthInTimezone(addMonthsInTimezone(current, monthOffset, timezone), timezone)
      : startOfMonthInTimezone(current, timezone);
    const rangeEnd = monthOffset > 0
      ? endOfMonthInTimezone(addMonthsInTimezone(current, monthOffset, timezone), timezone)
      : endOfMonthInTimezone(current, timezone);
    const start = addDaysInTimezone(rangeStart, -7, timezone);
    const end = addDaysInTimezone(rangeEnd, 7, timezone);
    api
      .get<CalendarEvent[]>(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      .then(setScheduleEvents)
      .catch(() => {});
  }, [timezone, monthOffset]);

  const dayEvents = scheduleEvents.filter((event) => eventSpansDate(event, getDateKey(viewDay, timezone), timezone));

  useEffect(() => {
    loadAccounts();
    loadScheduleEvents();
    api.get<{ failing: number; unstable: number }>('/api/gatus/status')
      .then((s) => setServiceStatus({ failing: s.failing, unstable: s.unstable }))
      .catch(() => {});
    api.get<{ pending: number }>('/api/seerr/requests')
      .then((s) => setMediaPending(s.pending))
      .catch(() => {});
    api.get<Record<string, string>>('/api/settings').then((settings) => {
      if (settings.home_layout) {
        try {
          const parsed = JSON.parse(settings.home_layout);
          const migrated = migrateLayout(parsed);
          if (migrated && migrated.cards.length > 0) {
            const savedIds = new Set(migrated.cards.map((c) => c.id));
            const missing = DEFAULT_GRID_LAYOUT.cards.filter((c) => !savedIds.has(c.id));
            for (const m of missing) {
              const slot = findEmptySlot(migrated.cards, m.colSpan, m.rowSpan);
              migrated.cards.push({ ...m, col: slot.col, row: slot.row });
            }
            setLayout(migrated);
          }
        } catch { /* use default */ }
      }
    }).catch(() => {});
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [loadAccounts, loadScheduleEvents]);

  useEffect(() => {
    if (editing && !layoutSnapshotRef.current) {
      layoutSnapshotRef.current = JSON.parse(JSON.stringify(layout));
    }
    if (!editing) {
      layoutSnapshotRef.current = null;
    }
  }, [editing, layout]);

  useWebSocket((msg) => {
    if (msg.type === 'sanders_cash_accounts') setAccounts(msg.payload as AccountWithMember[]);
    if (msg.type === 'calendar_synced') loadScheduleEvents();
  });

  const persistTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const persistLayout = useCallback((next: DashboardLayout) => {
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      api.put('/api/settings', { home_layout: JSON.stringify(next) }).catch(() => {});
    }, 400);
  }, []);

  const saveLayout = useCallback((next: DashboardLayout) => {
    setLayout(next);
    persistLayout(next);
  }, [persistLayout]);

  const handleMove = useCallback((id: string, col: number, row: number) => {
    setLayout((prev) => {
      const next = { ...prev, cards: prev.cards.map((c) => (c.id === id ? { ...c, col, row } : c)) };
      persistLayout(next);
      return next;
    });
  }, [persistLayout]);

  const handleSwap = useCallback((id: string, col: number, row: number, otherId: string, otherCol: number, otherRow: number) => {
    setLayout((prev) => {
      const next = {
        ...prev,
        cards: prev.cards.map((c) => {
          if (c.id === id) return { ...c, col, row };
          if (c.id === otherId) return { ...c, col: otherCol, row: otherRow };
          return c;
        }),
      };
      persistLayout(next);
      return next;
    });
  }, [persistLayout]);

  const handleResize = useCallback((id: string, colSpan: number, rowSpan: number) => {
    setLayout((prev) => {
      const next = { ...prev, cards: prev.cards.map((c) => (c.id === id ? { ...c, colSpan, rowSpan } : c)) };
      persistLayout(next);
      return next;
    });
  }, [persistLayout]);

  const handleRemove = (id: string) => {
    const next = { ...layout, cards: layout.cards.filter((c) => c.id !== id) };
    saveLayout(next);
  };

  const handleAdd = (id: string) => {
    if (layout.cards.some((c) => c.id === id)) return;
    const def = DEFAULT_GRID_LAYOUT.cards.find((c) => c.id === id);
    const mins = CARD_MIN_SIZES[id] || { minCol: 2, minRow: 1 };
    const colSpan = def?.colSpan ?? mins.minCol;
    const rowSpan = def?.rowSpan ?? mins.minRow;
    const slot = findEmptySlot(layout.cards, colSpan, rowSpan);
    const next = { ...layout, cards: [...layout.cards, { id, col: slot.col, row: slot.row, colSpan, rowSpan }] };
    saveLayout(next);
  };

  const toggleMode = () => {
    saveLayout({ ...layout, mode: layout.mode === 'fill' ? 'scroll' : 'fill' });
  };

  const cancelEditing = () => {
    if (layoutSnapshotRef.current) {
      setLayout(layoutSnapshotRef.current);
      persistLayout(layoutSnapshotRef.current);
    }
    setEditing(false);
  };

  const renderCard = (cardId: string): ReactNode => {
    switch (cardId) {
      case 'briefing':
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-baseline gap-3 mb-2">
              <h2 className="text-lg font-semibold text-text-bright">{greeting}</h2>
              <span className="text-text-bright text-sm font-semibold">
                {formatDate(now, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
              </span>
              <span className="text-primary-light text-lg font-bold">
                {formatTime(now, timezone)}
                <span className="text-xs text-text-dim font-medium ml-1">{formatDate(now, timezone, { timeZoneName: 'short' }).split(' ').pop()}</span>
              </span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto">
              <DailyBriefingCard compact />
            </div>
          </div>
        );

      case 'day-calendar':
        return (
          <>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <NavArrow direction="left" onClick={() => setDayOffset((o) => o - 1)} />
                <h2 className="text-lg font-semibold text-text-bright truncate">
                  {dayOffset === 0 ? 'Today' : formatDate(viewDay, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
                </h2>
                <NavArrow direction="right" onClick={() => setDayOffset((o) => o + 1)} />
              </div>
              <button onClick={() => navigate('/calendar')} className="text-primary-light text-sm font-medium shrink-0">View All →</button>
            </div>
            <DayView date={viewDay} events={dayEvents} compact referenceTime={now} />
          </>
        );

      case 'week-calendar':
        return (
          <>
            <div className="flex items-center justify-between mb-3 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <NavArrow direction="left" onClick={() => setWeekOffset((o) => o - 1)} />
                <h2 className="text-lg font-semibold text-text-bright truncate">
                  {weekOffset === 0 ? 'This Week' : formatWeekLabel(viewWeekStart, timezone)}
                </h2>
                <NavArrow direction="right" onClick={() => setWeekOffset((o) => o + 1)} />
              </div>
              <button onClick={() => navigate('/calendar')} className="text-primary-light text-sm font-medium shrink-0">View All →</button>
            </div>
            <WeekView startDate={viewWeekStart} events={scheduleEvents} referenceTime={now} showHeader={false} autoScrollRelevant compact />
          </>
        );

      case 'month-calendar':
        return (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-3 shrink-0 gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <NavArrow direction="left" onClick={() => setMonthOffset((o) => o - 1)} />
                <h2 className="text-lg font-semibold text-text-bright truncate">
                  {monthOffset === 0 ? 'Month' : formatDate(viewMonth, timezone, { month: 'short', year: 'numeric' })}
                </h2>
                <NavArrow direction="right" onClick={() => setMonthOffset((o) => o + 1)} />
              </div>
              <button onClick={() => navigate('/calendar')} className="text-primary-light text-sm font-medium shrink-0">View All →</button>
            </div>
            <MonthAgendaView date={viewMonth} events={scheduleEvents} referenceTime={now} autoScrollRelevant={monthOffset === 0} />
          </div>
        );

      case 'chores':
        return (
          <div className="cursor-pointer" onClick={() => navigate('/chores')}>
            <ChoresWidget />
          </div>
        );

      case 'tasks':
        return <VikunjaWidget compact />;

      case 'services':
        return <GatusWidget compact />;

      case 'media':
        return <SeerrWidget compact />;

      case 'sanders-cash':
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text-bright">Sanders Cash</h2>
              <button onClick={() => navigate('/sanders-cash')} className="text-primary-light text-sm font-medium">View All →</button>
            </div>
            <Leaderboard compact accounts={accounts} onSelect={() => navigate('/sanders-cash')} />
          </>
        );

      case 'weather':
        return <WeatherCard compact />;

      default:
        return null;
    }
  };

  const greeting = getGreeting(now, timezone);
  const hiddenCards = CARD_DEFS.filter((d) => !layout.cards.some((c) => c.id === d.id));

  const cardPulse = (id: string): 'red' | 'peach' | 'pink' | undefined => {
    if (id === 'services') {
      if (serviceStatus.failing > 0) return 'red';
      if (serviceStatus.unstable > 0) return 'peach';
    }
    if (id === 'media' && mediaPending > 0) return 'pink';
    return undefined;
  };

  return (
    <div className="flex flex-col h-full -m-4">
      {/* Edit banner */}
      {editing && (
        <div className="mx-4 mb-2 bg-primary-light/10 border border-primary-light/20 rounded-xl px-4 py-2.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-4">
            <div className="text-sm text-text-bright">
              <span className="font-semibold">Editing layout</span>
              <span className="text-text-dim ml-2">Drag to move. Drag edges to resize.</span>
            </div>
            <button
              onClick={toggleMode}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors ${
                layout.mode === 'fill'
                  ? 'bg-primary-light/15 text-primary-light'
                  : 'bg-surface-light text-text-dim hover:text-text-bright'
              }`}
            >
              Fit to page
            </button>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={cancelEditing} className="text-text-dim text-sm font-medium hover:text-text-bright transition-colors">
              Cancel
            </button>
            <button onClick={() => setEditing(false)} className="text-primary-light text-sm font-semibold">
              Done
            </button>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className={`flex-1 px-4 pt-4 ${layout.mode === 'scroll' ? 'overflow-y-auto pb-4' : 'overflow-hidden'}`}>
        <DashboardGrid layout={layout} editing={editing} containerRef={gridRef}>
          {layout.cards.map((card) => {
            const def = CARD_DEFS.find((d) => d.id === card.id);
            if (!def) return null;
            return (
              <GridCard
                key={card.id}
                card={card}
                label={def.label}
                editing={editing}
                allCards={layout.cards}
                containerRef={gridRef}
                gridMode={layout.mode}
                totalRows={layout.totalRows}
                pulseColor={cardPulse(card.id)}
                onMove={handleMove}
                onSwap={handleSwap}
                onResize={handleResize}
                onRemove={handleRemove}
              >
                {renderCard(card.id)}
              </GridCard>
            );
          })}
        </DashboardGrid>

        {/* Add card */}
        {editing && hiddenCards.length > 0 && (
          <div className="bg-surface rounded-2xl p-4 mt-4">
            <p className="text-text-dim text-xs font-medium uppercase tracking-wide mb-2">Add card</p>
            <div className="flex flex-wrap gap-2">
              {hiddenCards.map((def) => (
                <button
                  key={def.id}
                  onClick={() => handleAdd(def.id)}
                  className="flex items-center gap-1.5 bg-surface-light hover:bg-surface-lighter text-text-dim hover:text-text-bright px-3 py-1.5 rounded-lg text-sm transition-colors"
                >
                  <span>{def.icon}</span>
                  <span>{def.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavArrow({ direction, onClick }: { direction: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="w-7 h-7 flex items-center justify-center rounded-full text-text-dim hover:text-text-bright hover:bg-surface-light active:scale-90 transition-all"
    >
      {direction === 'left' ? '‹' : '›'}
    </button>
  );
}

function formatWeekLabel(weekStart: Date, timezone: string): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startStr = formatDate(weekStart, timezone, { month: 'short', day: 'numeric' });
  const endStr = formatDate(weekEnd, timezone, { month: 'short', day: 'numeric' });
  return `${startStr} – ${endStr}`;
}

function getGreeting(date: Date, timezone: string): string {
  const hour = getHour(date, timezone);
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}
