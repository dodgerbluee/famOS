import { useEffect, useRef, useState } from 'react';
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    timerRef.current = setTimeout(onDismiss, AUTO_DISMISS_MS);
    return () => clearTimeout(timerRef.current);
  }, [alert.eventId, onDismiss]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    setLiveReady(false);
    setConnecting(true);

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let receivedStreamData = false;

    const MAX_QUEUED_CHUNKS = 60;
    function pushChunk(chunk: ArrayBuffer) {
      queue.push(chunk);
      while (queue.length > MAX_QUEUED_CHUNKS) {
        queue.shift();
      }
    }

    function flushQueue() {
      if (!sb || sb.updating || queue.length === 0) return;
      const chunk = queue.shift()!;
      try {
        sb.appendBuffer(chunk);
      } catch {
        if (!sb.updating && ms.readyState === 'open') {
          try {
            const buffered = sb.buffered;
            if (buffered.length > 0 && buffered.end(0) - buffered.start(0) > 30) {
              sb.remove(buffered.start(0), buffered.end(0) - 10);
            }
          } catch { /* ignore */ }
        }
      }
    }

    function onSourceOpen() {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/api/cameras/${alert.camera}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        ws!.send(JSON.stringify({ type: 'mse' }));
      };

      ws.onmessage = (ev) => {
        if (typeof ev.data === 'string') {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'mse' && !sb) {
            try {
              sb = ms.addSourceBuffer(msg.value);
              sb.mode = 'segments';
              sb.addEventListener('updateend', flushQueue);
              receivedStreamData = true;
            } catch {
              setConnecting(false);
            }
          }
        } else if (ev.data instanceof ArrayBuffer && sb) {
          receivedStreamData = true;
          if (sb.updating) {
            pushChunk(ev.data);
          } else {
            try { sb.appendBuffer(ev.data); }
            catch { pushChunk(ev.data); }
          }
        }
      };

      ws.onerror = () => { if (!receivedStreamData) setConnecting(false); };
      ws.onclose = () => { if (!receivedStreamData) setConnecting(false); };
    }

    ms.addEventListener('sourceopen', onSourceOpen);

    const playInterval = setInterval(() => {
      if (!video) return;
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
      if (video.readyState >= 2) {
        setLiveReady(true);
        setConnecting(false);
      }
      if (video.buffered.length > 0) {
        const end = video.buffered.end(video.buffered.length - 1);
        if (end - video.currentTime > 3) {
          video.currentTime = end - 0.5;
        }
      }
    }, 500);

    return () => {
      ms.removeEventListener('sourceopen', onSourceOpen);
      clearInterval(playInterval);
      ws?.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [alert.camera]);

  const icon = LABEL_ICONS[alert.label] || '⚠️';
  const cardWidth = solo ? 'w-[480px]' : 'w-[340px]';
  const snapshotUrl = `/api/cameras/${alert.camera}/snapshot?t=${alert.eventId}`;
  const thumbnailUrl = `/api/cameras/events/${alert.eventId}/thumbnail?t=${alert.eventId}`;

  return (
    <div className={`${cardWidth} max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-accent-yellow/30 bg-surface shadow-2xl`}>
      <div onClick={onView} className="relative bg-black cursor-pointer" style={{ paddingBottom: '56.25%' }}>
        {!liveReady && (
          <img
            src={snapshotUrl}
            alt={alert.camera}
            className="absolute inset-0 w-full h-full object-cover"
          />
        )}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${liveReady ? 'opacity-100' : 'opacity-0'}`}
        />

        {connecting && (
          <div className="absolute top-2 left-2 bg-black/60 rounded-full p-1.5 flex items-center gap-1.5">
            <svg className="animate-spin w-3.5 h-3.5 text-white" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <span className="text-white text-[10px] font-semibold">Connecting</span>
          </div>
        )}

        {liveReady && (
          <div className="absolute top-2 left-2 bg-accent-red/90 rounded-full px-2 py-0.5 flex items-center gap-1">
            <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            <span className="text-white text-[10px] font-bold uppercase">Live</span>
          </div>
        )}

        <button
          onClick={(e) => { e.stopPropagation(); onOpenSnapshot(); }}
          className="absolute bottom-2 right-2 w-[35%] rounded-lg overflow-hidden border-2 border-accent-yellow/50 shadow-lg hover:border-accent-yellow transition-colors z-10"
        >
          <img
            src={thumbnailUrl}
            alt="Detection"
            className="w-full aspect-video object-cover"
          />
          <span className="absolute top-0.5 left-0.5 bg-accent-yellow/80 text-black text-[8px] font-bold px-1 py-px rounded">
            {alert.label.toUpperCase()}
          </span>
        </button>
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
