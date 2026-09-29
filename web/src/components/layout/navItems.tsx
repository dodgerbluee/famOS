import { type ReactNode } from 'react';

export interface NavItem {
  to: string;
  label: string;
  icon: (active: boolean) => ReactNode;
  permission: string;
}

function strokeIcon(active: boolean, paths: ReactNode) {
  return (
    <svg className="w-[22px] h-[22px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.4 : 1.8} strokeLinecap="round" strokeLinejoin="round">
      {paths}
    </svg>
  );
}

export const navItems: NavItem[] = [
  {
    to: '/', label: 'Home', permission: 'dashboard.view',
    icon: (active) => strokeIcon(active, (
      <>
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </>
    )),
  },
  {
    to: '/calendar', label: 'Calendar', permission: 'calendar.view',
    icon: (active) => strokeIcon(active, (
      <>
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
        <line x1="16" y1="2" x2="16" y2="6" />
        <line x1="8" y1="2" x2="8" y2="6" />
        <line x1="3" y1="10" x2="21" y2="10" />
      </>
    )),
  },
  {
    to: '/chores', label: 'Chores', permission: 'chores.view',
    icon: (active) => strokeIcon(active, (
      <>
        <polyline points="9 11 12 14 22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </>
    )),
  },
  {
    to: '/tasks', label: 'Tasks', permission: 'tasks.view',
    icon: (active) => strokeIcon(active, (
      <>
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </>
    )),
  },
  {
    to: '/cameras', label: 'Cameras', permission: 'cameras.view',
    icon: (active) => strokeIcon(active, (
      <>
        <path d="M23 7l-7 5 7 5V7z" />
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
      </>
    )),
  },
  {
    to: '/sanders-cash', label: 'Cash', permission: 'sanders_cash.view',
    icon: (active) => strokeIcon(active, (
      <>
        <line x1="12" y1="1" x2="12" y2="23" />
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </>
    )),
  },
  {
    to: '/weather', label: 'Weather', permission: 'dashboard.view',
    icon: (active) => strokeIcon(active, (
      <>
        <path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M17.66 6.34l1.41-1.41M6.34 17.66l-1.41 1.41M2 12h2M4.93 19.07l1.41-1.41M17.66 17.66l1.41 1.41" />
        <circle cx="12" cy="12" r="4" />
      </>
    )),
  },
];
