import { useEffect, useRef, useState, useCallback } from 'react';

export function useIdleTimeout(timeoutSeconds: number) {
  const [isIdle, setIsIdle] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastActivityRef = useRef(Date.now());

  const resetIdle = useCallback(() => {
    lastActivityRef.current = Date.now();
    if (isIdle) setIsIdle(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setIsIdle(true), timeoutSeconds * 1000);
  }, [timeoutSeconds, isIdle]);

  useEffect(() => {
    if (timeoutSeconds <= 0) return;

    timerRef.current = setTimeout(() => setIsIdle(true), timeoutSeconds * 1000);

    let throttleTimer: ReturnType<typeof setTimeout> | null = null;
    const onActivity = () => {
      if (isIdle) return;
      if (throttleTimer) return;
      throttleTimer = setTimeout(() => { throttleTimer = null; }, 500);
      lastActivityRef.current = Date.now();
      setIsIdle(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setIsIdle(true), timeoutSeconds * 1000);
    };

    const events = ['pointerdown', 'pointermove', 'keydown', 'scroll'] as const;
    for (const e of events) document.addEventListener(e, onActivity, { passive: true });

    return () => {
      for (const e of events) document.removeEventListener(e, onActivity);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (throttleTimer) clearTimeout(throttleTimer);
    };
  }, [timeoutSeconds, isIdle]);

  return { isIdle, resetIdle };
}
