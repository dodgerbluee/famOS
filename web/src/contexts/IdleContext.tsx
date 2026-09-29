import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';

interface IdleContextValue {
  isIdle: boolean;
  setIsIdle: (idle: boolean) => void;
}

const IdleContext = createContext<IdleContextValue>({
  isIdle: false,
  setIsIdle: () => {},
});

export function IdleProvider({ children }: { children: ReactNode }) {
  const [isIdle, setIsIdle] = useState(false);
  const value = useMemo(() => ({ isIdle, setIsIdle }), [isIdle]);
  return <IdleContext.Provider value={value}>{children}</IdleContext.Provider>;
}

export function useIdle() {
  return useContext(IdleContext).isIdle;
}

export function useIdleReporter() {
  return useContext(IdleContext).setIsIdle;
}
