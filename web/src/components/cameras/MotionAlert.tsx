import { useEffect, useRef } from 'react';
import type { MotionAlert } from '../../api/client';
import { formatTime, useTimezone } from '../../lib/timezone';

interface MotionAlertTrayProps {
  alerts: MotionAlert[];
  onDismiss: (eventId: string) => void;
  onDismissAll: () => void;
  onViewCamera: (camera: string) => void;
  onOpenCameras: () => void;
  onOpenSnapshot: (eventId: string) => void;
}

const LABEL_ICONS: Record<string, string> = {
  person: '🚶',
  car: '🚗',
  dog: '🐕',
  cat: '🐈',
  bird: '🐦',
  package: '📦',
};

const AUTO_DISMISS_MS = 20000;

export function MotionAlertTray({ alerts, onDismiss, onDismissAll, onViewCamera, onOpenCameras, onOpenSnapshot }: MotionAlertTrayProps) {
  const timezone = useTimezone();

  if (alerts.length === 0) return null;

  return (
    <div className="fixed bottom-24 right-4 z-[10001] max-w-[calc(100vw-2rem)] animate-[fadein_180ms_ease]">
      {alerts.length > 1 && (
        <div className="flex items-center justify-between mb-2 px-1">
          <span className="text-xs font-semibold text-accent-yellow">
            {alerts.length} cameras with motion
          </span>
          <button
            onClick={onDismissAll}
            className="text-xs text-text-dim hover:text-text-bright"
          >
            Dismiss all
          </button>
        </div>
      )}

      <div className="flex gap-3">
        {alerts.map((alert) => (
          <AlertCard
            key={alert.eventId}
            alert={alert}
            timezone={timezone}
            solo={alerts.length === 1}
            onDismiss={() => onDismiss(alert.eventId)}
            onView={() => onViewCamera(alert.camera)}
            onOpenCameras={onOpenCameras}
            onOpenSnapshot={() => onOpenSnapshot(alert.eventId)}
          />
        ))}
      </div>
    </div>
  );
}

function AlertCard({
  alert, timezone, solo, onDismiss, onView, onOpenCameras, onOpenSnapshot,
}: {
  alert: MotionAlert;
  timezone: string;
  solo: boolean;
  onDismiss: () => void;
  onView: () => void;
  onOpenCameras: () => void;
  onOpenSnapshot: () => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [alert.eventId, onDismiss]);

  const icon = LABEL_ICONS[alert.label] || '⚠️';
  const cardWidth = solo ? 'w-[480px]' : 'w-[340px]';
  const thumbnailUrl = `/api/cameras/events/${alert.eventId}/thumbnail?t=${alert.eventId}`;

  return (
    <div className={`${cardWidth} max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-accent-yellow/30 bg-surface shadow-2xl`}>
      <div onClick={onView} className="relative bg-black cursor-pointer" style={{ paddingBottom: '56.25%' }}>
        <img
          src={thumbnailUrl}
          alt={alert.camera}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <span className="absolute top-2 left-2 bg-accent-yellow/80 text-black text-[10px] font-bold px-2 py-0.5 rounded">
          {alert.label.toUpperCase()}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg leading-none">{icon}</span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-text-bright truncate">
              <span className="capitalize">{alert.camera.replace(/_/g, ' ')}</span>
            </p>
            <p className="text-xs text-text-dim">{formatTime(alert.timestamp, timezone)}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {solo && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCameras(); }}
              className="rounded-lg bg-primary px-2.5 py-1.5 text-xs font-medium text-white"
            >
              Cameras
            </button>
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onOpenSnapshot(); }}
            className="rounded-lg bg-surface-lighter px-2.5 py-1.5 text-xs font-medium text-text-bright"
          >
            Photo
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDismiss(); }}
            className="flex h-7 w-7 items-center justify-center rounded-full text-text-dim hover:text-text-bright text-lg"
          >
            &times;
          </button>
        </div>
      </div>
    </div>
  );
}

export { MotionAlertTray as MotionAlertToast };
