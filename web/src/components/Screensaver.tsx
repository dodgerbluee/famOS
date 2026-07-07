import { useEffect, useState, useRef } from 'react';
import { api } from '../api/client';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

interface ImmichAsset {
  id: string;
  type: string;
  createdAt?: string;
}

const DISPLAY_INTERVAL = 20000;

export function Screensaver() {
  const [timeoutSec, setTimeoutSec] = useState(0);
  const { isIdle, resetIdle } = useIdleTimeout(timeoutSec);
  const [photos, setPhotos] = useState<ImmichAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clock, setClock] = useState('');
  const [clockDate, setClockDate] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const rotateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastShownRef = useRef<string | null>(null);
  const photosRef = useRef<ImmichAsset[]>([]);
  const currentIndexRef = useRef(0);
  const inflightRef = useRef(false);
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    api.get<Record<string, string>>('/api/settings').then((settings) => {
      const raw = settings.screensaver_timeout;
      const parsed = raw ? parseInt(raw, 10) : 0;
      setTimeoutSec(parsed > 0 ? parsed : 0);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!isIdle) {
      if (rotateRef.current) clearTimeout(rotateRef.current);
      inflightRef.current = false;
      return;
    }

    if (photos.length === 0) {
      api.get<ImmichAsset[]>('/api/immich/album').then((assets) => {
        const shuffled = shuffleAvoidingRepeat(assets, lastShownRef.current);
        setPhotos(shuffled);
        photosRef.current = shuffled;
        setCurrentIndex(0);
        lastShownRef.current = shuffled[0]?.id ?? null;
      }).catch(() => setPhotos([]));
    }

    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setClockDate(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 10000);

    return () => clearInterval(clockInterval);
  }, [isIdle, photos.length]);

  const scheduleNext = () => {
    if (rotateRef.current) clearTimeout(rotateRef.current);
    rotateRef.current = setTimeout(() => {
      void goNext();
    }, DISPLAY_INTERVAL);
  };

  useEffect(() => {
    if (!isIdle || photos.length === 0) return;

    scheduleNext();

    return () => {
      if (rotateRef.current) clearTimeout(rotateRef.current);
      inflightRef.current = false;
    };
  }, [isIdle, photos.length]);

  const goNext = async () => {
    if (inflightRef.current || photosRef.current.length === 0) return;
    inflightRef.current = true;

    const activePhotos = photosRef.current;
    const current = activePhotos[currentIndexRef.current];
    let nextPhotos = activePhotos;
    let nextIndex = currentIndexRef.current + 1;

    if (nextIndex >= activePhotos.length) {
      nextPhotos = shuffleAvoidingRepeat(activePhotos, current?.id ?? null);
      photosRef.current = nextPhotos;
      setPhotos(nextPhotos);
      nextIndex = 0;
    }

    const next = nextPhotos[nextIndex];
    if (!next || next.id === current?.id) {
      inflightRef.current = false;
      scheduleNext();
      return;
    }

    try {
      await preloadImage(`/api/immich/assets/${next.id}`);
    } catch {
      inflightRef.current = false;
      scheduleNext();
      return;
    }

    setCurrentIndex(nextIndex);
    lastShownRef.current = next.id;
    inflightRef.current = false;
    scheduleNext();
  };

  const goPrevious = async () => {
    if (inflightRef.current || photosRef.current.length === 0) return;
    const prevIndex = currentIndexRef.current > 0 ? currentIndexRef.current - 1 : photosRef.current.length - 1;
    const prev = photosRef.current[prevIndex];
    if (!prev) return;
    try {
      await preloadImage(`/api/immich/assets/${prev.id}`);
    } catch {
      return;
    }
    setCurrentIndex(prevIndex);
    lastShownRef.current = prev.id;
    scheduleNext();
  };

  if (!isIdle || timeoutSec <= 0) return null;

  const currentPhoto = photos[currentIndex] ?? null;
  const imgA = currentPhoto ? `/api/immich/assets/${currentPhoto.id}` : '';

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    gestureStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = gestureStartRef.current;
    gestureStartRef.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dy) > Math.abs(dx) && dy < -80) {
      resetIdle();
      return;
    }
  };

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black"
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onKeyDown={resetIdle}
    >
      {photos.length > 0 ? (
        <button
          type="button"
          onDoubleClick={resetIdle}
          className="absolute inset-0 block h-full w-full cursor-default bg-transparent"
          aria-label="Double-click to wake screensaver"
        >
          <img
            src={imgA}
            className="absolute inset-0 w-full h-full object-contain"
            alt=""
          />
        </button>
      ) : null}

      <div className="absolute bottom-8 left-8 text-white/80">
        <div className="text-[6rem] leading-none font-light">{clock}</div>
        <div className="text-3xl font-light text-white/50 mt-2">{clockDate}</div>
      </div>

      <button
        type="button"
        onClick={() => { void goPrevious(); }}
        className="absolute left-6 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-4 py-3 text-3xl text-white/75 transition hover:bg-black/55 hover:text-white"
      >
        ‹
      </button>
      <button
        type="button"
        onClick={() => { void goNext(); }}
        className="absolute right-6 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-4 py-3 text-3xl text-white/75 transition hover:bg-black/55 hover:text-white"
      >
        ›
      </button>

      {/* Info button + photo date */}
      <div className="absolute bottom-8 right-8 flex items-center gap-3">
        {showInfo && currentPhoto?.createdAt && (
          <div className="bg-black/50 backdrop-blur-sm rounded-xl px-4 py-2 text-white/80 text-sm">
            {new Date(currentPhoto.createdAt).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            <span className="text-white/50 ml-2">
              {new Date(currentPhoto.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition ${
            showInfo ? 'bg-white/20 text-white' : 'bg-black/40 text-white/60 hover:bg-black/55 hover:text-white/80'
          }`}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="16" x2="12" y2="12" />
            <line x1="12" y1="8" x2="12.01" y2="8" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function shuffleAvoidingRepeat(arr: ImmichAsset[], lastShownId: string | null) {
  const unique = dedupeAssets(arr);
  const shuffled = interleaveTimeBuckets(unique);

  if (lastShownId && shuffled.length > 1 && shuffled[0]?.id === lastShownId) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }

  return shuffled;
}

async function preloadImage(src: string) {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('image load failed'));
    img.src = src;
  });
  if ('decode' in img) {
    try {
      await img.decode();
    } catch {
      // no-op after successful load
    }
  }
}

function dedupeAssets(arr: ImmichAsset[]) {
  const seen = new Set<string>();
  return arr.filter((asset) => {
    if (seen.has(asset.id)) return false;
    seen.add(asset.id);
    return true;
  });
}

function interleaveTimeBuckets(arr: ImmichAsset[]) {
  const buckets = new Map<string, ImmichAsset[]>();
  for (const asset of arr) {
    const key = bucketKey(asset.createdAt);
    const items = buckets.get(key) || [];
    items.push(asset);
    buckets.set(key, items);
  }

  const shuffledGroups = shuffleArray(Array.from(buckets.values()).map(shuffleArray));
  const result: ImmichAsset[] = [];
  let added = true;
  while (added) {
    added = false;
    for (const group of shuffledGroups) {
      const next = group.shift();
      if (next) {
        result.push(next);
        added = true;
      }
    }
  }
  return result;
}

function bucketKey(createdAt?: string) {
  if (!createdAt) return 'unknown';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return 'unknown';
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function shuffleArray<T>(arr: T[]) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
