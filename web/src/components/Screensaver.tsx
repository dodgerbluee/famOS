import { useEffect, useState, useRef } from 'react';
import { api, immichAssetUrl } from '../api/client';
import { useIdleTimeout } from '../hooks/useIdleTimeout';
import { useIdleReporter } from '../contexts/IdleContext';
import { useQuery } from '../lib/query';

interface ImmichAsset {
  id: string;
  type: string;
  createdAt?: string;
}

const DISPLAY_INTERVAL = 20000;
const ALBUM_REFRESH_MS = 60 * 60 * 1000;

export function Screensaver() {
  const { data: settings } = useQuery<Record<string, string>>(
    '/api/settings',
    () => api.get<Record<string, string>>('/api/settings'),
    { staleTime: 60_000 },
  );
  const timeoutSec = parseTimeout(settings?.screensaver_timeout);
  const { isIdle, resetIdle } = useIdleTimeout(timeoutSec);
  const setIdle = useIdleReporter();
  const [photos, setPhotos] = useState<ImmichAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [clock, setClock] = useState('');
  const [clockDate, setClockDate] = useState('');
  const [showInfo, setShowInfo] = useState(false);
  const [chromeVisible, setChromeVisible] = useState(false);
  const [front, setFront] = useState<'a' | 'b'>('a');
  const [srcA, setSrcA] = useState('');
  const [srcB, setSrcB] = useState('');
  const rotateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastShownRef = useRef<string | null>(null);
  const photosRef = useRef<ImmichAsset[]>([]);
  const currentIndexRef = useRef(0);
  const inflightRef = useRef(false);
  const goNextRef = useRef<() => Promise<void>>(async () => {});
  const gestureStartRef = useRef<{ x: number; y: number } | null>(null);
  const albumFetchedAt = useRef(0);

  useEffect(() => {
    setIdle(isIdle && timeoutSec > 0);
    return () => setIdle(false);
  }, [isIdle, timeoutSec, setIdle]);

  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  useEffect(() => {
    if (!isIdle) {
      if (rotateRef.current) clearTimeout(rotateRef.current);
      inflightRef.current = false;
      setChromeVisible(false);
      return;
    }

    const albumStale = Date.now() - albumFetchedAt.current > ALBUM_REFRESH_MS;
    if (photos.length === 0 || albumStale) {
      api.get<ImmichAsset[]>('/api/immich/album').then((assets) => {
        const shuffled = shuffleAvoidingRepeat(assets, lastShownRef.current);
        setPhotos(shuffled);
        photosRef.current = shuffled;
        setCurrentIndex(0);
        lastShownRef.current = shuffled[0]?.id ?? null;
        albumFetchedAt.current = Date.now();
        if (shuffled[0]) {
          const url = immichAssetUrl(shuffled[0].id, 'preview');
          setSrcA(url);
          setFront('a');
        }
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
      void goNextRef.current();
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

  const showPhoto = (asset: ImmichAsset, index: number) => {
    const url = immichAssetUrl(asset.id, 'preview');
    if (front === 'a') {
      setSrcB(url);
      setFront('b');
    } else {
      setSrcA(url);
      setFront('a');
    }
    setCurrentIndex(index);
    lastShownRef.current = asset.id;
  };

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
      await preloadImage(immichAssetUrl(next.id, 'preview'));
    } catch {
      inflightRef.current = false;
      scheduleNext();
      return;
    }

    showPhoto(next, nextIndex);
    inflightRef.current = false;
    scheduleNext();
  };
  goNextRef.current = goNext;

  const goPrevious = async () => {
    if (inflightRef.current || photosRef.current.length === 0) return;
    const prevIndex = currentIndexRef.current > 0 ? currentIndexRef.current - 1 : photosRef.current.length - 1;
    const prev = photosRef.current[prevIndex];
    if (!prev) return;
    try {
      await preloadImage(immichAssetUrl(prev.id, 'preview'));
    } catch {
      return;
    }
    showPhoto(prev, prevIndex);
    scheduleNext();
  };

  if (!isIdle || timeoutSec <= 0) return null;

  const currentPhoto = photos[currentIndex] ?? null;

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
    }
  };

  const handlePhotoTap = () => {
    if (!chromeVisible) {
      setChromeVisible(true);
      return;
    }
    resetIdle();
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
          onClick={handlePhotoTap}
          className="absolute inset-0 block h-full w-full cursor-default bg-transparent"
          aria-label="Tap to show controls, tap again to wake"
        >
          <img
            src={srcA}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${front === 'a' ? 'opacity-100' : 'opacity-0'}`}
            alt=""
          />
          <img
            src={srcB}
            className={`absolute inset-0 w-full h-full object-contain transition-opacity duration-500 ${front === 'b' ? 'opacity-100' : 'opacity-0'}`}
            alt=""
          />
        </button>
      ) : null}

      <div className="absolute bottom-4 left-4 md:bottom-8 md:left-8 text-white/80 pointer-events-none">
        <div className="text-[3rem] md:text-[6rem] leading-none font-light">{clock}</div>
        <div className="text-xl md:text-3xl font-light text-white/50 mt-2">{clockDate}</div>
      </div>

      {chromeVisible && (
        <>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void goPrevious(); }}
            className="absolute left-3 md:left-6 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 md:px-4 md:py-3 text-2xl md:text-3xl text-white/75 transition hover:bg-black/55 hover:text-white"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); void goNext(); }}
            className="absolute right-3 md:right-6 top-1/2 -translate-y-1/2 rounded-full bg-black/40 px-3 py-2 md:px-4 md:py-3 text-2xl md:text-3xl text-white/75 transition hover:bg-black/55 hover:text-white"
          >
            ›
          </button>

          <div className="absolute bottom-4 right-4 md:bottom-8 md:right-8 flex items-center gap-3">
            {showInfo && currentPhoto?.createdAt && (
              <div className="bg-black/50 rounded-xl px-4 py-2 text-white/80 text-sm">
                {new Date(currentPhoto.createdAt).toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                <span className="text-white/50 ml-2">
                  {new Date(currentPhoto.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </span>
              </div>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setShowInfo((v) => !v); }}
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
        </>
      )}
    </div>
  );
}

function parseTimeout(raw?: string) {
  const parsed = raw ? parseInt(raw, 10) : 0;
  return parsed > 0 ? parsed : 0;
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
