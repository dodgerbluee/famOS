import { NavLink } from 'react-router-dom';
import { motion } from 'framer-motion';

const navItems = [
  { to: '/', label: 'Home', icon: '⌂' },
  { to: '/calendar', label: 'Calendar', icon: '◫' },
  { to: '/chores', label: 'Chores', icon: '✓' },
  { to: '/cameras', label: 'Cameras', icon: '◉' },
  { to: '/sanders-cash', label: 'Cash', icon: '◈' },
  { to: '/settings', label: 'Settings', icon: '⚙' },
];

export function NavBar() {
  return (
    <nav className="flex items-center justify-around bg-surface border-t border-surface-lighter px-2 py-1 safe-bottom">
      {navItems.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className="flex flex-col items-center py-2 px-4 min-w-[64px] min-h-[64px] justify-center"
        >
          {({ isActive }) => (
            <motion.div
              className="flex flex-col items-center gap-1"
              animate={{ scale: isActive ? 1.1 : 1 }}
              transition={{ type: 'spring', stiffness: 300, damping: 20 }}
            >
              <span
                className={`text-2xl ${isActive ? 'text-primary-light' : 'text-text-dim'}`}
              >
                {item.icon}
              </span>
              <span
                className={`text-xs font-medium ${isActive ? 'text-primary-light' : 'text-text-dim'}`}
              >
                {item.label}
              </span>
            </motion.div>
          )}
        </NavLink>
      ))}
    </nav>
  );
}
