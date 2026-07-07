import { useState, useRef, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { NavBar } from './NavBar';
import { useAuth } from '../../contexts/AuthContext';

export interface ShellContext {
  editing: boolean;
  setEditing: (v: boolean | ((prev: boolean) => boolean)) => void;
}

export function Shell() {
  const { user, logout, hasPermission } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isHome = location.pathname === '/';

  useEffect(() => {
    if (!menuOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [menuOpen]);

  return (
    <div className="flex flex-col h-full">
      {user && (
        <header className="sticky top-4 z-50 px-4 flex justify-center mb-2">
          <div className="w-full h-[45px] bg-surface rounded-2xl border border-surface-lighter shadow-lg px-5 flex items-center justify-between">
            <span className="text-lg font-bold text-text-bright tracking-tight">famOS</span>

            <div className="flex items-center gap-2">
            <div ref={menuRef} className="relative flex items-center">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-surface-lighter transition-colors"
              >
                <span className="text-sm font-medium text-text-bright">{user.name}</span>
                <svg
                  className={`w-4 h-4 text-text-dim transition-transform ${menuOpen ? 'rotate-180' : ''}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </button>

              {menuOpen && (
                <div className="absolute top-full right-0 mt-2 min-w-[10rem] bg-surface rounded-xl border border-surface-lighter shadow-lg py-1 z-50">
                  {hasPermission('settings.view') && (
                    <button
                      onClick={() => { setMenuOpen(false); navigate('/settings'); }}
                      className="w-full px-4 py-2.5 text-left text-sm text-text-bright hover:bg-surface-lighter transition-colors flex items-center gap-2"
                    >
                      <svg className="w-4 h-4 text-text-dim" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                      Settings
                    </button>
                  )}
                  <button
                    onClick={() => { setMenuOpen(false); logout(); }}
                    className="w-full px-4 py-2.5 text-left text-sm text-accent-red hover:bg-surface-lighter transition-colors flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Logout
                  </button>
                </div>
              )}
            </div>

              {isHome && (
                <button
                  onClick={() => setEditing((e) => !e)}
                  className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                    editing ? 'bg-primary-light text-surface' : 'text-text-dim hover:text-text-bright hover:bg-surface-lighter'
                  }`}
                  title="Edit layout"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </header>
      )}
      <main className="flex-1 overflow-hidden px-4 pb-4 pt-4">
        <div className="h-full overflow-y-auto bg-surface rounded-2xl border border-surface-lighter p-4">
          <Outlet context={{ editing, setEditing } satisfies ShellContext} />
        </div>
      </main>
      <NavBar />
    </div>
  );
}
