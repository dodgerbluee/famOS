import { useEffect, useState, useCallback, useRef } from 'react';
import { api, type Camera } from '../../api/client';

interface CameraGridProps {
  onSelect?: (camera: Camera) => void;
}

type Settings = Record<string, string>;

export function CameraGrid({ onSelect }: CameraGridProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOrder, setCameraOrder] = useState<string[]>([]);
  const [cameraFitModes, setCameraFitModes] = useState<Record<string, 'cover' | 'contain'>>({});
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const load = useCallback(() => {
    Promise.all([
      api.get<{ available: boolean }>('/api/cameras/status'),
      api.get<Settings>('/api/settings'),
    ])
      .then(([status, settings]) => {
        setAvailable(status.available);
        const order = settings.camera_order ? JSON.parse(settings.camera_order) as string[] : [];
        setCameraOrder(order);
        setCameraFitModes(parseCameraFitModes(settings.camera_fit_modes || ''));
        if (status.available) {
          return api.get<Camera[]>('/api/cameras').then(setCameras);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const sortedCameras = sortCameras(cameras, cameraOrder);

  const saveOrder = (order: string[]) => {
    setCameraOrder(order);
    api.put('/api/settings', { camera_order: JSON.stringify(order) }).catch(() => {});
  };

  const handleDragStart = (index: number) => {
    dragItem.current = index;
  };

  const handleDragEnter = (index: number) => {
    dragOverItem.current = index;
  };

  const handleDragEnd = () => {
    if (dragItem.current === null || dragOverItem.current === null) return;
    if (dragItem.current === dragOverItem.current) {
      dragItem.current = null;
      dragOverItem.current = null;
      return;
    }

    const reordered = [...sortedCameras];
    const [removed] = reordered.splice(dragItem.current, 1);
    reordered.splice(dragOverItem.current, 0, removed);

    const newOrder = reordered.map((c) => c.name);
    saveOrder(newOrder);

    dragItem.current = null;
    dragOverItem.current = null;
  };

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-accent-red text-lg mb-2">Camera Error</p>
        <p className="text-text-dim text-sm">{error}</p>
        <button onClick={load} className="mt-4 text-primary-light text-sm font-medium">
          Retry
        </button>
      </div>
    );
  }

  if (available === false) {
    return (
      <div className="text-center py-12">
        <p className="text-text-dim text-2xl mb-2">Frigate not reachable</p>
        <p className="text-text-dim text-sm">Check URL and credentials in Settings</p>
        <button onClick={load} className="mt-4 text-primary-light text-sm font-medium">
          Retry
        </button>
      </div>
    );
  }

  if (available === null) {
    return (
      <div className="text-center py-12">
        <p className="text-text-dim">Checking cameras...</p>
      </div>
    );
  }

  if (sortedCameras.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-text-dim">No cameras found in Frigate</p>
      </div>
    );
  }

  const cols = sortedCameras.length <= 2 ? 'grid-cols-1 sm:grid-cols-2' :
               sortedCameras.length <= 4 ? 'grid-cols-2' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';

  return (
    <div className={`grid ${cols} gap-3`}>
      {sortedCameras.map((cam, index) => (
        <CameraTile
          key={cam.name}
          camera={cam}
          index={index}
          onSelect={onSelect}
          onDragStart={handleDragStart}
          onDragEnter={handleDragEnter}
          onDragEnd={handleDragEnd}
          fitMode={cameraFitModes[cam.name] || 'cover'}
        />
      ))}
    </div>
  );
}

interface CameraTileProps {
  camera: Camera;
  index: number;
  onSelect?: (camera: Camera) => void;
  onDragStart: (index: number) => void;
  onDragEnter: (index: number) => void;
  onDragEnd: () => void;
  fitMode: 'cover' | 'contain';
}

function CameraTile({ camera, index, onSelect, onDragStart, onDragEnter, onDragEnd, fitMode }: CameraTileProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [liveReady, setLiveReady] = useState(false);
  const [connecting, setConnecting] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const ms = new MediaSource();
    video.src = URL.createObjectURL(ms);

    let ws: WebSocket | null = null;
    let sb: SourceBuffer | null = null;
    const queue: ArrayBuffer[] = [];
    let connected = false;

    const failTimer = setTimeout(() => {
      if (!connected) setConnecting(false);
    }, 8000);

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

    ms.addEventListener('sourceopen', () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/api/cameras/${camera.name}/stream`);
      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        connected = true;
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
            } catch {
              setConnecting(false);
            }
          }
        } else if (ev.data instanceof ArrayBuffer && sb) {
          if (sb.updating) {
            queue.push(ev.data);
          } else {
            try { sb.appendBuffer(ev.data); }
            catch { queue.push(ev.data); }
          }
        }
      };

      ws.onerror = () => { if (!connected) setConnecting(false); };
      ws.onclose = () => { if (!connected) setConnecting(false); };
    });

    const playInterval = setInterval(() => {
      if (!video) return;
      if (video.paused && video.readyState >= 2) {
        video.play().catch(() => {});
      }
      if (video.readyState >= 2 && !liveReady) {
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
      clearTimeout(failTimer);
      clearInterval(playInterval);
      ws?.close();
      if (ms.readyState === 'open') {
        try { ms.endOfStream(); } catch { /* ignore */ }
      }
      URL.revokeObjectURL(video.src);
    };
  }, [camera.name]);

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragEnter={() => onDragEnter(index)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      className="relative rounded-2xl bg-surface-light cursor-pointer active:scale-[0.98] transition-transform"
      style={{ overflow: 'clip' }}
      onClick={() => onSelect?.(camera)}
    >
      <div className="relative w-full bg-black" style={{ paddingBottom: '50%' }}>
        {/* Snapshot — always rendered, hidden when live is ready */}
        <img
          src={`${camera.snapshotUrl}?t=${Date.now()}`}
          alt={camera.name}
          className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${liveReady ? 'opacity-0' : 'opacity-100'}`}
        />
        {/* Live video — layered on top, fades in when ready */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full ${fitMode === 'contain' ? 'object-contain' : 'object-cover'} transition-opacity duration-300 ${liveReady ? 'opacity-100' : 'opacity-0'}`}
        />
      </div>

      {/* Loading spinner in top-right while connecting */}
      {connecting && (
        <div className="absolute top-2 right-2 bg-black/50 rounded-full p-1.5">
          <svg
            className="animate-spin w-4 h-4 text-white"
            viewBox="0 0 24 24"
            fill="none"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        </div>
      )}

      {/* Live indicator when streaming */}
      {liveReady && (
        <div className="absolute top-2 right-2 bg-accent-red/90 rounded-full px-2 py-0.5 flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
          <span className="text-white text-[10px] font-bold uppercase">Live</span>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent p-2">
        <p className="text-white font-medium text-xs capitalize">
          {camera.name.replace(/_/g, ' ')}
        </p>
      </div>
    </div>
  );
}

function parseCameraFitModes(raw: string): Record<string, 'cover' | 'contain'> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => value === 'cover' || value === 'contain') as Array<[string, 'cover' | 'contain']>
    );
  } catch {
    return {};
  }
}

function sortCameras(cameras: Camera[], order: string[]): Camera[] {
  if (order.length === 0) {
    return [...cameras].sort((a, b) => a.name.localeCompare(b.name));
  }

  const orderMap = new Map(order.map((name, i) => [name, i]));
  return [...cameras].sort((a, b) => {
    const aIdx = orderMap.get(a.name);
    const bIdx = orderMap.get(b.name);
    if (aIdx !== undefined && bIdx !== undefined) return aIdx - bIdx;
    if (aIdx !== undefined) return -1;
    if (bIdx !== undefined) return 1;
    return a.name.localeCompare(b.name);
  });
}
