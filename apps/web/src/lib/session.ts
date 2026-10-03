import "server-only";
import { headers } from "next/headers";
import type { AuthUser } from "@visibility/core";

export async function getCurrentUser(): Promise<AuthUser | null> {
  const incoming = await headers();
  try {
    const response = await fetch(`${process.env.API_URL ?? "http://127.0.0.1:4000"}/api/me`, {
      headers: { cookie: incoming.get("cookie") ?? "" }, cache: "no-store",
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) return null;
    return ((await response.json()) as { data: AuthUser }).data;
  } catch { return null; }
}
