"use client";

import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

type EuModeContextValue = {
  euMode: boolean;
  setEuMode: (value: boolean) => void;
  toggleEuMode: () => void;
};

const EuModeContext = createContext<EuModeContextValue>({
  euMode: true,
  setEuMode: () => {},
  toggleEuMode: () => {}
});

export function EuModeProvider({ children, defaultValue = true }: { children: ReactNode; defaultValue?: boolean }) {
  const [euMode, setEuModeState] = useState(defaultValue);

  const setEuMode = useCallback((value: boolean) => {
    setEuModeState(value);
    // Persist preference
    if (typeof window !== "undefined") {
      localStorage.setItem("eu_mode", String(value));
    }
  }, []);

  const toggleEuMode = useCallback(() => {
    setEuMode(!euMode);
  }, [euMode, setEuMode]);

  return (
    <EuModeContext.Provider value={{ euMode, setEuMode, toggleEuMode }}>
      {children}
    </EuModeContext.Provider>
  );
}

export function useEuMode() {
  return useContext(EuModeContext);
}
