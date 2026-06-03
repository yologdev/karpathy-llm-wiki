import { notFound } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { isOwnerHandle } from "@/lib/owner";
import { LintClient } from "./LintClient";

/**
 * Lint (wiki health check) is an owner-only admin tool. Non-owners (and
 * signed-out users) get a 404 — the link is also hidden from the nav, and the
 * `/api/lint` + `/api/lint/fix` routes hard-reject non-owners.
 */
export default async function LintPage() {
  const principal = await getPrincipal();
  if (!isOwnerHandle(principal?.handle)) {
    notFound();
  }
  return <LintClient />;
}
