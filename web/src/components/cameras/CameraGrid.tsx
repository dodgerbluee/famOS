import { useEffect, useState, useCallback, useRef } from 'react';
import { api, cameraSnapshotUrl, type Camera } from '../../api/client';
import { useIsMobile } from '../../hooks/useIsMobile';
import { useQuery } from '../../lib/query';
import { LiveStream } from './LiveStream';

interface CameraGridProps {
  onSelect?: (camera: Camera) => void;
  liveMosaic: boolean;
}

type Settings = Record<string, string>;

export function CameraGrid({ onSelect, liveMosaic }: CameraGridProps) {
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cameraOrder, setCameraOrder] = useState<string[]>([]);
  const [cameraFitModes, setCameraFitModes] = useState<Record<string, 'cover' | 'contain'>>({});
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);
  const isMobile = useIsMobile();
  const { data: settings } = useQuery<Settings>(
    '/api/settings',
    () => api.get<Settings>('/api/settings'),
    { staleTime: 30_000 },
  );

  const load = useCallback(() => {
    api.get<{ available: boolean }>('/api/cameras/status')
      .then((status) => {
        setAvailable(status.available);
        if (status.available) {
          return api.get<Camera[]>('/api/cameras').then(setCameras);
        }
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!settings) return;
    const order = settings.camera_order ? JSON.parse(settings.camera_order) as string[] : [];
    setCameraOrder(order);
    setCameraFitModes(parseCameraFitModes(settings.camera_fit_modes || ''));
  }, [settings]);

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
          disableDrag={isMobile}
          live={liveMosaic}
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
  disableDrag?: boolean;
  live: boolean;
}

function CameraTile({ camera, index, onSelect, onDragStart, onDragEnter, onDragEnd, fitMode, disableDrag, live }: CameraTileProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const fit = fitMode === 'contain' ? 'object-contain' : 'object-cover';

  useEffect(() => {
    if (live) return;
    const interval = setInterval(() => setRefreshKey((k) => k + 1), 10_000);
    return () => clearInterval(interval);
  }, [live]);

  return (
    <div
      draggable={!disableDrag}
      onDragStart={disableDrag ? undefined : () => onDragStart(index)}
      onDragEnter={disableDrag ? undefined : () => onDragEnter(index)}
      onDragEnd={disableDrag ? undefined : onDragEnd}
      onDragOver={disableDrag ? undefined : (e) => e.preventDefault()}
      className="relative rounded-2xl bg-surface-light cursor-pointer active:scale-[0.98] transition-transform"
      style={{ overflow: 'clip' }}
      onClick={() => onSelect?.(camera)}
    >
      <div className="relative w-full bg-black" style={{ paddingBottom: '50%' }}>
        <img
          src={`${cameraSnapshotUrl(camera.name, 360)}&t=${refreshKey}`}
          alt={camera.name}
          className={`absolute inset-0 w-full h-full ${fit} ${live ? 'opacity-0' : 'opacity-100'}`}
        />
        {live && (
          <LiveStream
            cameraName={camera.name}
            className={`absolute inset-0 w-full h-full ${fit}`}
            fallbackPollMs={10_000}
            snapshotHeight={360}
          />
        )}
      </div>

      {live && (
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
