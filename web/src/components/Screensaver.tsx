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
  const [currentPhoto, setCurrentPhoto] = useState<ImmichAsset | null>(null);
  const [clock, setClock] = useState('');
  const [clockDate, setClockDate] = useState('');
  const rotateRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastShownRef = useRef<string | null>(null);
  const queueRef = useRef<ImmichAsset[]>([]);
  const photosRef = useRef<ImmichAsset[]>([]);
  const currentPhotoRef = useRef<ImmichAsset | null>(null);
  const inflightRef = useRef(false);

  useEffect(() => {
    currentPhotoRef.current = currentPhoto;
  }, [currentPhoto]);

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
        queueRef.current = shuffled.slice(1);
        const first = shuffled[0] ?? null;
        setCurrentPhoto(first);
        lastShownRef.current = first?.id ?? null;
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

  useEffect(() => {
    if (!isIdle || photos.length === 0 || !currentPhotoRef.current) return;

    if (rotateRef.current) clearTimeout(rotateRef.current);

    const scheduleNext = () => {
      rotateRef.current = setTimeout(advanceSlide, DISPLAY_INTERVAL);
    };

    const advanceSlide = async () => {
      if (inflightRef.current) return;
      inflightRef.current = true;

      const current = currentPhotoRef.current;
      const next = nextPhotoFromQueue(queueRef.current, photosRef.current, current?.id ?? null, lastShownRef.current);
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

      setCurrentPhoto(next);
      lastShownRef.current = next.id;
      queueRef.current = consumeQueue(queueRef.current, next.id, photosRef.current, lastShownRef.current);
      inflightRef.current = false;
      scheduleNext();
    };

    scheduleNext();

    return () => {
      if (rotateRef.current) clearTimeout(rotateRef.current);
      inflightRef.current = false;
    };
  }, [isIdle, photos.length]);

  if (!isIdle || timeoutSec <= 0) return null;

  const imgA = currentPhoto ? `/api/immich/assets/${currentPhoto.id}` : '';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black"
      onPointerDown={resetIdle}
      onKeyDown={resetIdle}
    >
      {photos.length > 0 ? (
        <img
          src={imgA}
          className="absolute inset-0 w-full h-full object-contain"
          alt=""
        />
      ) : null}

      <div className="absolute bottom-8 left-8 text-white/80">
        <div className="text-5xl font-light">{clock}</div>
        <div className="text-lg font-light text-white/50 mt-1">{clockDate}</div>
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

function nextPhotoFromQueue(queue: ImmichAsset[], allPhotos: ImmichAsset[], currentId: string | null, lastShownId: string | null) {
  if (queue.length === 0) {
    queue.push(...shuffleAvoidingRepeat(allPhotos, lastShownId).filter((photo) => photo.id !== currentId));
  }
  return queue[0] ?? allPhotos.find((photo) => photo.id !== currentId) ?? null;
}

function consumeQueue(queue: ImmichAsset[], consumedId: string, allPhotos: ImmichAsset[], lastShownId: string | null) {
  let nextQueue = queue.filter((photo) => photo.id !== consumedId);
  if (nextQueue.length === 0) {
    nextQueue = shuffleAvoidingRepeat(allPhotos, lastShownId).filter((photo) => photo.id !== consumedId);
  }
  return nextQueue;
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

  const groups = shuffleArray(Array.from(buckets.values()).map(shuffleArray));
  const result: ImmichAsset[] = [];
  let added = true;

  while (added) {
    added = false;
    for (const group of groups) {
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
