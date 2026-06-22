"use client";

import { Suspense, type ReactNode } from "react";
import { KeyboardShortcutsProvider } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { ToastProvider } from "@/hooks/useToast";
import { ToastContainer } from "@/components/ToastContainer";
import { Analytics } from "@/components/Analytics";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <KeyboardShortcutsProvider>
      <ToastProvider>
        {children}
        <ToastContainer />
        <ShortcutsHelp />
        {/* PostHog page-view tracking; Suspense satisfies useSearchParams. */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
      </ToastProvider>
    </KeyboardShortcutsProvider>
  );
}
