import type { ApiError } from "@visibility/core";

export async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event("analytiq-session-expired"));
    let message = `Request failed (${response.status}). Check that the API is running.`;
    try { message = ((await response.json()) as ApiError).error?.message ?? message; } catch { /* Proxy may return HTML when API is offline. */ }
    throw new Error(message);
  }
  if (response.status === 204) return undefined as T;
  return ((await response.json()) as { data: T }).data;
}
