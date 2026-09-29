import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { navItems } from './navItems';

export function NavBar({ className = '' }: { className?: string }) {
  const { hasPermission } = useAuth();
  const visible = navItems.filter((item) => hasPermission(item.permission));

  return (
    <nav
      className={`bg-surface border-t border-surface-lighter shadow-[0_-2px_10px_rgba(0,0,0,0.15)] safe-bottom ${className}`}
    >
      <div className="grid" style={{ gridTemplateColumns: `repeat(${visible.length}, 1fr)` }}>
        {visible.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className="flex flex-col items-center justify-center py-2 min-h-[56px]"
          >
            {({ isActive }) => (
              <div className="flex flex-col items-center gap-0.5">
                <span className={isActive ? 'text-primary-light' : 'text-text-dim'}>
                  {item.icon(isActive)}
                </span>
                <span className={`text-[11px] font-medium ${isActive ? 'text-primary-light' : 'text-text-dim'}`}>
                  {item.label}
                </span>
              </div>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export function NavRail() {
  const { hasPermission } = useAuth();
  const visible = navItems.filter((item) => hasPermission(item.permission));

  return (
    <nav className="hidden md:flex flex-col w-24 shrink-0 py-3 gap-0.5">
      {visible.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className="flex flex-col items-center justify-center min-h-[56px] mx-2 rounded-xl hover:bg-surface-lighter/60"
        >
          {({ isActive }) => (
            <div className={`flex flex-col items-center gap-0.5 px-1 text-center ${isActive ? 'text-primary-light' : 'text-text-dim'}`}>
              {item.icon(isActive)}
              <span className="text-[10px] font-medium leading-tight">{item.label}</span>
            </div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
