'use client';

import { createContext, useContext, useState, ReactNode } from 'react';

interface GlowContextType {
  glowColor: string | null;
  setGlowColor: (color: string | null) => void;
}

const GlowContext = createContext<GlowContextType | undefined>(undefined);

export function GlowProvider({ children }: { children: ReactNode }) {
  const [glowColor, setGlowColor] = useState<string | null>(null);

  return (
    <GlowContext.Provider value={{ glowColor, setGlowColor }}>
      {children}
    </GlowContext.Provider>
  );
}

export function useGlow() {
  const context = useContext(GlowContext);
  if (!context) throw new Error('useGlow must be used within a GlowProvider');
  return context;
}