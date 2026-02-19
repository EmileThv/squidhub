"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

type CreditsContextType = {
  credits: number;
  refreshCredits: () => Promise<void>;
};

const CreditsContext = createContext<CreditsContextType | null>(null);

export function CreditsProvider({ children }: { children: React.ReactNode }) {
  const [credits, setCredits] = useState<number>(0);

  const refreshCredits = async () => {
    const res = await fetch("/api/credits");
    if (!res.ok) return;
    const data = await res.json();
    setCredits(data.credits);
  };

  useEffect(() => {
    refreshCredits();

    const onFocus = () => refreshCredits();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  return (
    <CreditsContext.Provider value={{ credits, refreshCredits }}>
      {children}
    </CreditsContext.Provider>
  );
}

export function useCredits() {
  const ctx = useContext(CreditsContext);
  if (!ctx) {
    throw new Error("useCredits must be used inside CreditsProvider");
  }
  return ctx;
}