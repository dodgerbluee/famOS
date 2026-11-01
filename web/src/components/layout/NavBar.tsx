import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { navItems, type NavItem } from './navItems';

const compactPrimary = new Set(['/', '/calendar', '/chores', '/sanders-cash']);
const focusableSelector = 'a[href], button:not([disabled])';

const settingsItem: NavItem = {
  to: '/settings',
  label: 'Settings',
  permission: 'settings.view',
  icon: (active) => (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21h-4v-.09A1.7 1.7 0 0 0 8.6 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H3v-4h.09A1.7 1.7 0 0 0 4.6 8.6a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V3h4v.09A1.7 1.7 0 0 0 15.4 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.13.38.34.72.6 1 .3.27.68.4 1.1.4h.09v4h-.09c-.42 0-.8.14-1.1.4-.26.28-.47.62-.6 1Z" />
    </svg>
  ),
};

function routeIsActive(pathname: string, to: string) {
  return to === '/' ? pathname === '/' : pathname === to || pathname.startsWith(`${to}/`);
}

function RailLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} className="min-w-0 rounded-control">
      {({ isActive }) => (
        <span className={`relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-control px-1 transition-colors ${isActive ? 'bg-brand/15 text-brand-soft' : 'text-ink-muted hover:bg-panel-hover hover:text-ink'}`}>
          {isActive && <span className="absolute -left-2 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-full bg-brand" />}
          {item.icon(isActive)}
          <span className="text-[10px] font-medium leading-tight">{item.label}</span>
        </span>
      )}
    </NavLink>
  );
}

export function NavRail() {
  const { hasPermission } = useAuth();
  const visible = navItems.filter((item) => hasPermission(item.permission));
  return (
    <nav aria-label="Primary" className="hidden rail:flex w-[var(--rail-width)] shrink-0 flex-col gap-1 border-r border-border-subtle bg-panel/75 p-2 backdrop-blur-xl">
      <div className="mb-1 flex h-10 items-center justify-center text-lg font-black tracking-[-0.08em] text-brand-soft" aria-label="famOS">fO</div>
      {visible.map((item) => <RailLink key={item.to} item={item} />)}
    </nav>
  );
}

function BottomLink({ item, onNavigate }: { item: NavItem; onNavigate?: () => void }) {
  return (
    <NavLink to={item.to} end={item.to === '/'} onClick={onNavigate} className="flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 px-1 py-1.5">
      {({ isActive }) => (
        <>
          <span className={`rounded-full px-4 py-0.5 transition-colors ${isActive ? 'bg-brand/15 text-brand-soft' : 'text-ink-muted'}`}>{item.icon(isActive)}</span>
          <span className={`text-[10px] font-medium ${isActive ? 'text-brand-soft' : 'text-ink-muted'}`}>{item.label}</span>
        </>
      )}
    </NavLink>
  );
}

export function NavBar() {
  const { hasPermission } = useAuth();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const visible = navItems.filter((item) => hasPermission(item.permission));
  const primary = visible.filter((item) => compactPrimary.has(item.to));
  const overflow = visible.filter((item) => !compactPrimary.has(item.to));
  const sheetItems = hasPermission(settingsItem.permission) ? [...overflow, settingsItem] : overflow;
  const moreActive = sheetItems.some((item) => routeIsActive(location.pathname, item.to));

  useEffect(() => {
    const fullNavigation = window.matchMedia('(min-width: 37.5rem)');
    const closeAtFullWidth = (event: MediaQueryListEvent) => {
      if (event.matches) setOpen(false);
    };
    fullNavigation.addEventListener('change', closeAtFullWidth);
    return () => fullNavigation.removeEventListener('change', closeAtFullWidth);
  }, []);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    dialog?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(focusableSelector)];
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <>
      <nav aria-label="Primary" className="rail:hidden shrink-0 border-t border-border-subtle bg-panel/95 safe-bottom backdrop-blur-xl">
        <div className="hidden xs:grid" style={{ gridTemplateColumns: `repeat(${visible.length}, minmax(0, 1fr))` }}>
          {visible.map((item) => <BottomLink key={item.to} item={item} />)}
        </div>
        <div className="grid xs:hidden" style={{ gridTemplateColumns: `repeat(${primary.length + 1}, minmax(0, 1fr))` }}>
          {primary.map((item) => <BottomLink key={item.to} item={item} />)}
          <button ref={triggerRef} type="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(true)} className={`flex min-h-[60px] min-w-0 flex-col items-center justify-center gap-0.5 ${moreActive ? 'text-brand-soft' : 'text-ink-muted'}`}>
            <span className={`rounded-full px-4 py-1 ${moreActive ? 'bg-brand/15' : ''}`}>
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="19" cy="12" r="1.7" /></svg>
            </span>
            <span className="text-[10px] font-medium">More</span>
          </button>
        </div>
      </nav>

      {open && (
        <div className="fixed inset-0 z-[100] rail:hidden">
          <button aria-label="Close navigation" className="absolute inset-0 h-full w-full bg-black/65 animate-overlay-fade-in" onClick={() => setOpen(false)} />
          <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="More destinations" tabIndex={-1} className="absolute inset-x-0 bottom-0 rounded-t-dialog border-t border-border bg-panel-raised pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl outline-none animate-sheet-slide-in">
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border" />
            <div className="flex items-center justify-between px-4 py-2">
              <h2 className="text-sm font-semibold text-ink">More</h2>
              <button onClick={() => setOpen(false)} aria-label="Close destinations" className="flex h-11 w-11 items-center justify-center rounded-control text-ink-muted hover:bg-panel-hover hover:text-ink">×</button>
            </div>
            <div className="grid grid-cols-3 gap-2 px-3">
              {sheetItems.map((item) => (
                <NavLink key={item.to} to={item.to} onClick={() => setOpen(false)} className="flex min-h-[76px] flex-col items-center justify-center gap-1 rounded-control border border-border-subtle bg-panel text-ink-muted hover:bg-panel-hover">
                  {({ isActive }) => <><span className={isActive ? 'text-brand-soft' : ''}>{item.icon(isActive)}</span><span className="text-xs font-medium">{item.label}</span></>}
                </NavLink>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
