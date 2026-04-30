"use client";

import { useToast, type ToastVariant } from "@/hooks/useToast";

const variantClasses: Record<ToastVariant, string> = {
  error:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  success:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  info: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warning:
    "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
};

const iconMap: Record<ToastVariant, string> = {
  success: "✓",
  error: "✕",
  info: "ℹ",
  warning: "⚠",
};

export function ToastContainer() {
  const { toasts, removeToast } = useToast();

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`flex items-center gap-2 rounded-lg border px-4 py-3 text-sm shadow-lg transition-all duration-300 animate-in slide-in-from-bottom-2 fade-in ${variantClasses[toast.variant]}`}
        >
          <span className="flex-shrink-0" aria-hidden="true">
            {iconMap[toast.variant]}
          </span>
          <span className="flex-1">{toast.message}</span>
          <button
            onClick={() => removeToast(toast.id)}
            aria-label="Dismiss notification"
            className="flex-shrink-0 rounded p-0.5 opacity-60 hover:opacity-100 transition-opacity"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
