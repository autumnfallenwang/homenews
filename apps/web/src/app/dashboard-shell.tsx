"use client";

import { useRouter } from "next/navigation";
import { createContext, type ReactNode, useContext, useMemo, useTransition } from "react";

interface NavigationCtx {
  isPending: boolean;
  navigate: (url: string) => void;
}

const NavigationContext = createContext<NavigationCtx | null>(null);

export function DashboardShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const value = useMemo<NavigationCtx>(
    () => ({
      isPending,
      navigate: (url: string) =>
        startTransition(() => {
          router.replace(url, { scroll: false });
        }),
    }),
    [isPending, router],
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

export function useNavigation(): NavigationCtx {
  const ctx = useContext(NavigationContext);
  if (!ctx) throw new Error("useNavigation must be used within DashboardShell");
  return ctx;
}
