import { useState, useCallback } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Shell } from './components/layout/Shell';
import { Home } from './pages/Home';
import { Calendar } from './pages/Calendar';
import { Cameras } from './pages/Cameras';
import { SandersCash } from './pages/SandersCash';
import { RewardStore } from './pages/RewardStore';
import { Settings } from './pages/Settings';
import { Weather } from './pages/Weather';
import { BatchProcesses } from './pages/BatchProcesses';
import { Chores } from './pages/Chores';
import { Login } from './pages/Login';
import { Setup } from './pages/Setup';
import { JoinFamily } from './pages/JoinFamily';
import { useWebSocket } from './hooks/useWebSocket';
import { MotionAlertTray } from './components/cameras/MotionAlert';
import { Screensaver } from './components/Screensaver';
import type { MotionAlert } from './api/client';

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

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { user, loading, needsSetup } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (needsSetup) return <Navigate to="/setup" replace />;
  if (!user) return <Navigate to="/login" replace />;

  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <GlobalMotionAlert />
        <Screensaver />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/join/:token" element={<JoinFamily />} />
          <Route element={<RequireAuth><Shell /></RequireAuth>}>
            <Route path="/" element={<Home />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/cameras" element={<Cameras />} />
            <Route path="/sanders-cash" element={<SandersCash />} />
            <Route path="/sanders-cash/store" element={<RewardStore />} />
            <Route path="/weather" element={<Weather />} />
            <Route path="/chores" element={<Chores />} />
            <Route path="/batch" element={<BatchProcesses />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
