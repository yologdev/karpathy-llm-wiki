"use client";

import { KeyboardShortcutsProvider } from "@/hooks/useKeyboardShortcuts";
import { ShortcutsHelp } from "@/components/ShortcutsHelp";
import { ToastProvider } from "@/hooks/useToast";
import { ToastContainer } from "@/components/ToastContainer";
import type { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <KeyboardShortcutsProvider>
      <ToastProvider>
        {children}
        <ToastContainer />
        <ShortcutsHelp />
      </ToastProvider>
    </KeyboardShortcutsProvider>
  );
}
