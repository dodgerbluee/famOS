import { useEffect, useState } from 'react';
import { useIdle } from '../contexts/IdleContext';

export function useStreamPaused() {
  const idle = useIdle();
  const [hidden, setHidden] = useState(() => typeof document !== 'undefined' && document.hidden);

  useEffect(() => {
    const onVis = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  return idle || hidden;
}
