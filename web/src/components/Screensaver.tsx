import { useEffect, useState, useRef, useCallback } from 'react';
import { api } from '../api/client';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

interface ImmichAsset {
  id: string;
  type: string;
}

const ROTATE_INTERVAL = 10000;

export function Screensaver() {
  const [timeoutSec, setTimeoutSec] = useState(0);
  const { isIdle, resetIdle } = useIdleTimeout(timeoutSec);
  const [photos, setPhotos] = useState<ImmichAsset[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [showSecond, setShowSecond] = useState(false);
  const [clock, setClock] = useState('');
  const [clockDate, setClockDate] = useState('');
  const rotateRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  useEffect(() => {
    api.get<Record<string, string>>('/api/settings').then((settings) => {
      const raw = settings.screensaver_timeout;
      const parsed = raw ? parseInt(raw, 10) : 0;
      setTimeoutSec(parsed > 0 ? parsed : 0);
    }).catch(() => {});
  }, []);

  const shuffle = useCallback((arr: ImmichAsset[]) => {
    const shuffled = [...arr];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }, []);

  useEffect(() => {
    if (!isIdle) {
      if (rotateRef.current) clearInterval(rotateRef.current);
      return;
    }

    api.get<ImmichAsset[]>('/api/immich/album').then((assets) => {
      setPhotos(shuffle(assets));
      setCurrentIndex(0);
      setShowSecond(false);
    }).catch(() => setPhotos([]));

    const updateClock = () => {
      const now = new Date();
      setClock(now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }));
      setClockDate(now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }));
    };
    updateClock();
    const clockInterval = setInterval(updateClock, 10000);

    return () => clearInterval(clockInterval);
  }, [isIdle, shuffle]);

  useEffect(() => {
    if (!isIdle || photos.length < 2) return;

    rotateRef.current = setInterval(() => {
      setShowSecond((prev) => !prev);
      setTimeout(() => {
        setCurrentIndex((i) => (i + 2 >= photos.length ? 0 : i + 2));
      }, 1200);
    }, ROTATE_INTERVAL);

    return () => { if (rotateRef.current) clearInterval(rotateRef.current); };
  }, [isIdle, photos]);

  if (!isIdle || timeoutSec <= 0) return null;

  const imgA = photos.length > 0 ? `/api/immich/assets/${photos[currentIndex]?.id}` : '';
  const imgB = photos.length > 1 ? `/api/immich/assets/${photos[(currentIndex + 1) % photos.length]?.id}` : '';

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black"
      onPointerDown={resetIdle}
      onKeyDown={resetIdle}
    >
      {photos.length > 0 ? (
        <>
          <img
            src={imgA}
            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-[1200ms]"
            style={{ opacity: showSecond ? 0 : 1 }}
            alt=""
          />
          {imgB && (
            <img
              src={imgB}
              className="absolute inset-0 w-full h-full object-contain transition-opacity duration-[1200ms]"
              style={{ opacity: showSecond ? 1 : 0 }}
              alt=""
            />
          )}
        </>
      ) : null}

      <div className="absolute bottom-8 left-8 text-white/80">
        <div className="text-5xl font-light">{clock}</div>
        <div className="text-lg font-light text-white/50 mt-1">{clockDate}</div>
      </div>
    </div>
  );
}
