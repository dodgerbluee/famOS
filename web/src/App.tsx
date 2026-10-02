import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { WebSocketProvider, useWebSocket } from './contexts/WebSocketContext';
import { IdleProvider } from './contexts/IdleContext';
import { Shell } from './components/layout/Shell';
import { Login } from './pages/Login';
import { MotionAlertTray } from './components/cameras/MotionAlert';
import { Screensaver } from './components/Screensaver';
import { invalidateQueriesWithPrefix, setQueryData, useQuery } from './lib/query';
import { seedDashboard } from './lib/dashboardSeed';
import { seedDashboardCalendarEvents } from './lib/calendarQuery';
import { useTimezone } from './lib/timezone';
import { api, type AccountWithMember, type DashboardPayload, type MotionAlert } from './api/client';

const Cameras = lazy(() => import('./pages/Cameras').then((m) => ({ default: m.Cameras })));
const SandersCash = lazy(() => import('./pages/SandersCash').then((m) => ({ default: m.SandersCash })));
const SandersCashKid = lazy(() => import('./pages/SandersCashKid').then((m) => ({ default: m.SandersCashKid })));
const RewardStore = lazy(() => import('./pages/RewardStore').then((m) => ({ default: m.RewardStore })));
const Settings = lazy(() => import('./pages/Settings').then((m) => ({ default: m.Settings })));
const Weather = lazy(() => import('./pages/Weather').then((m) => ({ default: m.Weather })));
const BatchProcesses = lazy(() => import('./pages/BatchProcesses').then((m) => ({ default: m.BatchProcesses })));
const Chores = lazy(() => import('./pages/Chores').then((m) => ({ default: m.Chores })));
const Tasks = lazy(() => import('./pages/Tasks').then((m) => ({ default: m.Tasks })));
const Setup = lazy(() => import('./pages/Setup').then((m) => ({ default: m.Setup })));
const JoinFamily = lazy(() => import('./pages/JoinFamily').then((m) => ({ default: m.JoinFamily })));
const PairKiosk = lazy(() => import('./pages/PairKiosk').then((m) => ({ default: m.PairKiosk })));
const SetupKiosk = lazy(() => import('./pages/SetupKiosk').then((m) => ({ default: m.SetupKiosk })));
const ApproveKiosk = lazy(() => import('./pages/ApproveKiosk').then((m) => ({ default: m.ApproveKiosk })));
const OAuthComplete = lazy(() => import('./pages/OAuthComplete').then((m) => ({ default: m.OAuthComplete })));

function RouteFallback() {
  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function QuerySync() {
  const { user } = useAuth();
  const timezone = useTimezone();
  const { data: dashboard } = useQuery<DashboardPayload>(
    '/api/dashboard',
    () => api.get<DashboardPayload>('/api/dashboard'),
    { staleTime: 10_000, enabled: Boolean(user) },
  );

  useEffect(() => {
    if (!dashboard) return;
    seedDashboard(dashboard);
    seedDashboardCalendarEvents(dashboard.events ?? [], timezone);
  }, [dashboard, timezone]);

  useWebSocket(
    useCallback((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'sanders_cash_accounts') {
        setQueryData('/api/sanders-cash/accounts', msg.payload as AccountWithMember[]);
      }
      if (msg.type === 'calendar_synced') {
        invalidateQueriesWithPrefix('/api/calendar/events');
        invalidateQueriesWithPrefix('/api/calendar/sources');
        invalidateQueriesWithPrefix('/api/dashboard');
      }
      if (msg.type === 'chore_templates_updated') {
        invalidateQueriesWithPrefix('/api/chore-templates');
        invalidateQueriesWithPrefix('/api/dashboard');
      }
    }, [])
  );
  return null;
}

function GlobalMotionAlert() {
  const [alerts, setAlerts] = useState<MotionAlert[]>([]);
  const navigate = useNavigate();

  useWebSocket(
    useCallback((msg: { type: string; payload: unknown }) => {
      if (msg.type === 'motion_alert') {
        const incoming = msg.payload as MotionAlert;
        setAlerts((prev) => {
          const exists = prev.some((a) => a.camera === incoming.camera);
          if (exists) return prev.map((a) => a.camera === incoming.camera ? incoming : a);
          return [...prev, incoming];
        });
      }
    }, [])
  );

  return (
    <MotionAlertTray
      alerts={alerts}
      onDismiss={(eventId) => setAlerts((prev) => prev.filter((a) => a.eventId !== eventId))}
      onDismissAll={() => setAlerts([])}
      onViewCamera={(camera) => navigate(`/cameras?camera=${encodeURIComponent(camera)}`)}
      onOpenCameras={() => navigate('/cameras')}
      onOpenSnapshot={(eventId) => {
        window.open(`/api/cameras/events/${eventId}/thumbnail`, '_blank', 'noopener,noreferrer');
      }}
    />
  );
}

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, needsSetup } = useAuth();
  const [showSpinner, setShowSpinner] = useState(false);

  useEffect(() => {
    if (!loading) {
      setShowSpinner(false);
      return;
    }
    const timer = window.setTimeout(() => setShowSpinner(true), 300);
    return () => window.clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        {showSpinner && (
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        )}
      </div>
    );
  }

  if (user) return <>{children}</>;
  if (needsSetup) return <Navigate to="/setup" replace />;
  return <Navigate to="/login" replace />;
}

function RealtimeLayer({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <IdleProvider>
      <WebSocketProvider enabled={Boolean(user)}>
        <QuerySync />
        <GlobalMotionAlert />
        <Screensaver />
        {children}
      </WebSocketProvider>
    </IdleProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RealtimeLayer>
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/auth/oauth/complete" element={<OAuthComplete />} />
              <Route path="/setup" element={<Setup />} />
              <Route path="/join/:token" element={<JoinFamily />} />
              <Route path="/kiosk/setup" element={<SetupKiosk />} />
              <Route path="/kiosk/pair/:token" element={<PairKiosk />} />
              <Route path="/kiosk/approve/:token" element={<ApproveKiosk />} />
              <Route element={<RequireAuth><Shell /></RequireAuth>}>
                <Route path="/" element={null} />
                <Route path="/calendar" element={null} />
                <Route path="/cameras" element={<Cameras />} />
                <Route path="/sanders-cash" element={<SandersCash />} />
                <Route path="/sanders-cash/store" element={<RewardStore />} />
                <Route path="/sanders-cash/:memberId" element={<SandersCashKid />} />
                <Route path="/weather" element={<Weather />} />
                <Route path="/chores" element={<Chores />} />
                <Route path="/tasks" element={<Tasks />} />
                <Route path="/batch" element={<BatchProcesses />} />
                <Route path="/settings" element={<Settings />} />
              </Route>
            </Routes>
          </Suspense>
        </RealtimeLayer>
      </AuthProvider>
    </BrowserRouter>
  );
}
