import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { NavBar, NavRail } from './NavBar';
import { KeepAlivePages } from './KeepAlivePages';
import { useAuth } from '../../contexts/AuthContext';
import { ShellStateProvider, type ShellContext } from '../../contexts/ShellContext';
import { refreshVisibleQueries } from '../../lib/query';

export type { ShellContext };

function isKeepAlivePath(pathname: string) {
  return pathname === '/' || pathname === '/calendar';
}

export function Shell() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [routeEpoch, setRouteEpoch] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);
  const isHome = location.pathname === '/';
  const keepAlive = isKeepAlivePath(location.pathname);

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('pointerdown', handleClick);
    return () => document.removeEventListener('pointerdown', handleClick);
  }, [menuOpen]);

  return (
    <div className="app-canvas flex h-[100dvh] w-full">
      <NavRail />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {user && (
        <header className="safe-top z-50 flex h-[calc(var(--topbar-height)+env(safe-area-inset-top))] shrink-0 items-center justify-between gap-3 border-b border-border-subtle bg-panel/55 px-[var(--page-gutter)] backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <span className="text-base font-bold tracking-tight text-ink rail:hidden">famOS</span>
              <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] text-ink-faint rail:inline">Family dashboard</span>
            </div>

            <div className="flex min-w-0 items-center gap-2">
            <div ref={menuRef} className="relative flex min-w-0 items-center">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex min-w-0 items-center gap-2 rounded-control px-2 py-1.5 hover:bg-panel-hover transition-colors"
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="max-w-32 truncate text-sm font-medium text-ink sm:max-w-52">{user.name}</span>
                {user.role === 'kiosk' && (
                  <span className="hidden rounded-md bg-panel-hover px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-muted sm:inline">Kiosk</span>
                )}
                <svg
                  className={`h-4 w-4 shrink-0 text-ink-muted transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {menuOpen && (
                <div role="menu" className="absolute right-0 top-full z-50 mt-2 min-w-[11rem] overflow-hidden rounded-dialog border border-border bg-panel-raised py-1 shadow-2xl">
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      refreshVisibleQueries();
                      setRouteEpoch((n) => n + 1);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink hover:bg-panel-hover transition-colors"
                  >
                    <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <polyline points="1 20 1 14 7 14" />
                      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                    </svg>
                    Update
                  </button>
                  {hasPermission('settings.view') && (
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-ink hover:bg-panel-hover transition-colors"
                    >
                      <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Settings
                    </button>
                  )}
                  {user.role !== 'kiosk' && (
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-negative hover:bg-panel-hover transition-colors"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Logout
                  </button>
                  )}
                </div>
              )}
            </div>

              {isHome && (
                <button
                  onClick={() => setEditing((e) => !e)}
                  className={`hidden min-h-[44px] min-w-[44px] items-center justify-center rounded-control transition-colors wide:flex ${
                    editing ? 'bg-brand text-white' : 'text-ink-muted hover:bg-panel-hover hover:text-ink'
                  }`}
                  aria-label="Edit dashboard layout"
                  title="Edit layout"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
              )}
            </div>
        </header>
      )}
      <main className={`min-h-0 min-w-0 flex-1 overscroll-contain ${keepAlive ? 'overflow-hidden' : 'overflow-auto'}`}>
          <ShellStateProvider value={{ editing, setEditing }}>
            <KeepAlivePages />
            {!keepAlive && (
              <Outlet key={routeEpoch} context={{ editing, setEditing } satisfies ShellContext} />
            )}
          </ShellStateProvider>
      </main>
      <NavBar />
      </div>
    </div>
  );
}
