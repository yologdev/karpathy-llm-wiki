import { notFound } from "next/navigation";
import { getPrincipal } from "@/lib/auth";
import { isOwnerHandle } from "@/lib/owner";

/**
 * Settings is an admin (site-owner) surface — it exposes the LLM provider/model
 * + embedding config. Gate the whole `/settings` route to the owner; everyone
 * else gets a 404 (don't even reveal it exists). The page itself is a client
 * component, so the gate lives in this server layout. The entry point is the
 * owner-only "Settings" item in the user menu (see NavHeader).
 */
export default async function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const principal = await getPrincipal();
  if (!isOwnerHandle(principal?.handle)) notFound();
  return <>{children}</>;
}
