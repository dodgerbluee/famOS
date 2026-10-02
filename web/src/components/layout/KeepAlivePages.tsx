import { lazy, Suspense, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Home } from '../../pages/Home';

const Calendar = lazy(() => import('../../pages/Calendar').then((m) => ({ default: m.Calendar })));

function RouteFallback() {
  return (
    <div className="min-h-[40vh] h-full flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

/**
 * Home and Calendar stay mounted across Home↔Calendar (and while visiting other
 * tabs) so the kiosk does not rebuild those trees. Cameras is NOT kept here —
 * live MSE must tear down when leaving /cameras.
 */
export function KeepAlivePages() {
  const location = useLocation();
  const isHome = location.pathname === '/';
  const isCalendar = location.pathname === '/calendar';
  const [seenHome, setSeenHome] = useState(isHome);
  const [seenCalendar, setSeenCalendar] = useState(isCalendar);

  if (isHome && !seenHome) setSeenHome(true);
  if (isCalendar && !seenCalendar) setSeenCalendar(true);

  useEffect(() => {
    void import('../../pages/Calendar');
  }, []);

  return (
    <>
      {seenHome && (
        <div className={isHome ? 'h-full' : 'hidden'} aria-hidden={!isHome}>
          <Home />
        </div>
      )}
      {seenCalendar && (
        <div className={isCalendar ? 'h-full' : 'hidden'} aria-hidden={!isCalendar}>
          <Suspense fallback={<RouteFallback />}>
            <Calendar />
          </Suspense>
        </div>
      )}
    </>
  );
}
