import type { ReactNode } from "react";

const variantClasses: Record<AlertVariant, string> = {
  error:
    "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200",
  success:
    "border-green-300 bg-green-50 text-green-800 dark:border-green-800 dark:bg-green-950 dark:text-green-200",
  info: "border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200",
  warning:
    "border-yellow-300 bg-yellow-50 text-yellow-800 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-200",
};

type AlertVariant = "error" | "success" | "info" | "warning";

interface AlertProps {
  variant: AlertVariant;
  children: ReactNode;
  className?: string;
}

export function Alert({ variant, children, className }: AlertProps) {
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${variantClasses[variant]}${className ? ` ${className}` : ""}`}
    >
      {children}
    </div>
  );
}
