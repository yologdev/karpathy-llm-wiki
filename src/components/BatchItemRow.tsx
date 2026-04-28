import Link from "next/link";

export interface BatchItem {
  url: string;
  status: "pending" | "processing" | "success" | "error";
  slug?: string;
  error?: string;
}

function statusIcon(status: BatchItem["status"]) {
  switch (status) {
    case "pending":
      return "⏳";
    case "processing":
      return "🔄";
    case "success":
      return "✅";
    case "error":
      return "❌";
  }
}

interface BatchItemRowProps {
  item: BatchItem;
}

export function BatchItemRow({ item }: BatchItemRowProps) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-foreground/10 px-4 py-3 text-sm">
      <span className="shrink-0 text-base leading-5">
        {statusIcon(item.status)}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-xs text-foreground/60">
          {item.url}
        </p>
        {item.status === "success" && item.slug && (
          <p className="mt-1">
            Created{" "}
            <Link
              href={`/wiki/${item.slug}`}
              className="font-medium text-foreground hover:underline"
            >
              {item.slug}
            </Link>
          </p>
        )}
        {item.status === "error" && item.error && (
          <p className="mt-1 text-red-600 dark:text-red-400">
            {item.error}
          </p>
        )}
      </div>
    </li>
  );
}
