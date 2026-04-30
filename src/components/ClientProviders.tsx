"use client";

import { ToastProvider } from "@/hooks/useToast";
import { ToastContainer } from "@/components/ToastContainer";
import type { ReactNode } from "react";

export function ClientProviders({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      {children}
      <ToastContainer />
    </ToastProvider>
  );
}
