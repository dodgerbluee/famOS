import { useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, CONDITION_ICONS, type AccountWithMember, type CalendarEvent, type WeatherData } from '../api/client';
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
import { getCalendarEventDateKey } from '../lib/calendar';
import { addDaysInTimezone, endOfMonthInTimezone, formatDate, formatTime, getDateKey, getHour, startOfMonthInTimezone, startOfWeekInTimezone, useTimezone } from '../lib/timezone';

interface CardDef {
  id: string;
  label: string;
  icon: string;
}

const CARD_DEFS: CardDef[] = [
  { id: 'briefing', label: 'AI Briefing', icon: '✦' },
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
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [now, setNow] = useState(new Date());
  const [dayOffset, setDayOffset] = useState(0);
  const [weekOffset, setWeekOffset] = useState(0);
  const [layout, setLayout] = useState<DashboardLayout>(DEFAULT_GRID_LAYOUT);
  const [editing, setEditing] = useState(false);
  const [serviceStatus, setServiceStatus] = useState<{ failing: number; unstable: number }>({ failing: 0, unstable: 0 });
  const [mediaPending, setMediaPending] = useState(0);
  const gridRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const timezone = useTimezone();

  const viewDay = addDaysInTimezone(now, dayOffset, timezone);

  const viewWeekStart = addDaysInTimezone(startOfWeekInTimezone(now, timezone), weekOffset * 7, timezone);

  const loadAccounts = useCallback(() => {
    api.get<AccountWithMember[]>('/api/sanders-cash/accounts').then(setAccounts).catch(() => {});
  }, []);

  const loadScheduleEvents = useCallback(() => {
    const current = new Date();
    const start = addDaysInTimezone(startOfMonthInTimezone(current, timezone), -7, timezone);
    const end = addDaysInTimezone(endOfMonthInTimezone(current, timezone), 7, timezone);
    api
      .get<CalendarEvent[]>(
        `/api/calendar/events?start=${start.toISOString()}&end=${end.toISOString()}`
      )
      .then(setScheduleEvents)
      .catch(() => {});
  }, [timezone]);

  const dayEvents = scheduleEvents.filter((event) => getCalendarEventDateKey(event, timezone) === getDateKey(viewDay, timezone));

  useEffect(() => {
    loadAccounts();
    loadScheduleEvents();
    api.get<WeatherData>('/api/weather').then(setWeather).catch(() => {});
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

  const renderCard = (cardId: string): ReactNode => {
    switch (cardId) {
      case 'briefing':
        return <DailyBriefingCard compact />;

      case 'day-calendar':
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <NavArrow direction="left" onClick={() => setDayOffset((o) => o - 1)} />
                <h2 className="text-lg font-semibold text-text-bright">
                  {dayOffset === 0 ? 'Today' : formatDate(viewDay, timezone, { weekday: 'short', month: 'short', day: 'numeric' })}
                </h2>
                <NavArrow direction="right" onClick={() => setDayOffset((o) => o + 1)} />
                {dayOffset !== 0 && (
                  <button onClick={() => setDayOffset(0)} className="text-primary-light text-xs font-medium ml-1">Today</button>
                )}
              </div>
              <button onClick={() => navigate('/calendar')} className="text-primary-light text-sm font-medium">View All →</button>
            </div>
            <DayView date={viewDay} events={dayEvents} compact referenceTime={now} />
          </>
        );

      case 'week-calendar':
        return (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <NavArrow direction="left" onClick={() => setWeekOffset((o) => o - 1)} />
                <h2 className="text-lg font-semibold text-text-bright">
                  {weekOffset === 0 ? 'This Week' : formatWeekLabel(viewWeekStart, timezone)}
                </h2>
                <NavArrow direction="right" onClick={() => setWeekOffset((o) => o + 1)} />
                {weekOffset !== 0 && (
                  <button onClick={() => setWeekOffset(0)} className="text-primary-light text-xs font-medium ml-1">This Week</button>
                )}
              </div>
              <button onClick={() => navigate('/calendar')} className="text-primary-light text-sm font-medium">View All →</button>
            </div>
            <WeekView startDate={viewWeekStart} events={scheduleEvents} referenceTime={now} showHeader={false} />
          </>
        );

      case 'month-calendar':
        return (
          <div className="cursor-pointer" onClick={() => navigate('/calendar')}>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-text-bright">This Month</h2>
              <span className="text-primary-light text-sm font-medium">View All →</span>
            </div>
            <MonthAgendaView date={now} events={scheduleEvents} referenceTime={now} />
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
        return (
          <div className="cursor-pointer" onClick={() => navigate('/weather')}>
            <WeatherCard compact />
          </div>
        );

      default:
        return null;
    }
  };

  const greeting = getGreeting(now, timezone);
  const weatherIcon = weather ? CONDITION_ICONS[weather.condition] || '🌤️' : '';
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
      {/* Header */}
      <header className="flex items-center justify-between px-4 pt-4 pb-2 shrink-0">
        <div>
          <h1 className="text-3xl font-bold text-text-bright">{greeting}</h1>
          <p className="text-text-dim text-sm">
            {formatDate(now, timezone, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <div className="flex items-center gap-3 text-right">
          <button
            onClick={() => setEditing(!editing)}
            className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
              editing ? 'bg-primary-light text-surface' : 'text-text-dim hover:text-text-bright hover:bg-surface-light'
            }`}
            title="Edit layout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
            </svg>
          </button>
          <p className="text-text-dim text-lg">{formatTime(now, timezone)}</p>
          {weather && (
            <button
              onClick={() => navigate('/weather')}
              className="flex items-center gap-2.5 active:scale-95 transition-transform"
            >
              <span className="text-xl">{weatherIcon}</span>
              <div className="text-left">
                <div className="flex items-end gap-1.5">
                  <p className="text-text-bright text-xl font-bold leading-none">{Math.round(weather.temperature)}°</p>
                  <p className="text-text-dim text-[11px] leading-none mb-0.5">↑{Math.round(weather.high)}° ↓{Math.round(weather.low)}°</p>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  <HeaderSunItem icon="sunrise" time={formatTime(weather.sunrise, timezone)} />
                  <HeaderSunItem icon="sunset" time={formatTime(weather.sunset, timezone)} />
                  <HeaderSunItem icon="dusk" time={formatTime(weather.dusk || estimateDusk(weather.sunset), timezone)} />
                </div>
              </div>
            </button>
          )}
        </div>
      </header>

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
              className="flex items-center gap-1.5 bg-surface-light rounded-lg px-2.5 py-1 text-xs font-medium text-text-dim hover:text-text-bright transition-colors"
            >
              <span className={layout.mode === 'fill' ? 'text-primary-light' : ''}>Fill</span>
              <span className="text-text-dim">/</span>
              <span className={layout.mode === 'scroll' ? 'text-primary-light' : ''}>Scroll</span>
            </button>
          </div>
          <button onClick={() => setEditing(false)} className="text-primary-light text-sm font-semibold">
            Done
          </button>
        </div>
      )}

      {/* Grid */}
      <div className={`flex-1 p-4 ${layout.mode === 'scroll' ? 'overflow-y-auto' : 'overflow-hidden'}`}>
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

function estimateDusk(sunset: string) {
  if (!sunset) return '';
  const date = new Date(sunset);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() + 30);
  return date.toISOString();
}

const SUN_ICONS = {
  sunrise: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2v3" stroke="#f59e0b" />
      <path d="M5.64 11.64l1.41 1.41M16.95 11.64l-1.41 1.41" stroke="#f59e0b" />
      <path d="M18 18a6 6 0 0 0-12 0" stroke="#f59e0b" />
      <path d="M2 18h20" stroke="#f59e0b" />
    </svg>
  ),
  sunset: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 8v3" stroke="#fb923c" />
      <path d="M5.64 11.64l1.41 1.41M16.95 11.64l-1.41 1.41" stroke="#fb923c" />
      <path d="M18 18a6 6 0 0 0-12 0" stroke="#fb923c" />
      <path d="M2 18h20" stroke="#fb923c" />
    </svg>
  ),
  dusk: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z" stroke="#94a3b8" />
    </svg>
  ),
} as const;

function HeaderSunItem({ icon, time }: { icon: keyof typeof SUN_ICONS; time: string }) {
  return (
    <span className="flex items-center gap-0.5">
      {SUN_ICONS[icon]}
      <span className="text-text-dim text-[10px] font-medium">{time}</span>
    </span>
  );
}
