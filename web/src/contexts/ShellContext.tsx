import { createContext, useContext, type ReactNode } from 'react';

export interface ShellContext {
  editing: boolean;
  setEditing: (v: boolean | ((prev: boolean) => boolean)) => void;
}

const ShellStateContext = createContext<ShellContext>({
  editing: false,
  setEditing: () => {},
});

export function ShellStateProvider({ value, children }: { value: ShellContext; children: ReactNode }) {
  return <ShellStateContext.Provider value={value}>{children}</ShellStateContext.Provider>;
}

export function useShell() {
  return useContext(ShellStateContext);
}
