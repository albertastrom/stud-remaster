export function parseTabUrl(raw: string | undefined): {
  url: string;
  host: string;
  pathname: string;
  search: string;
  internal: boolean;
} | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  const internal = !["http:", "https:"].includes(parsed.protocol);
  return {
    url: `${parsed.origin}${parsed.pathname}${parsed.search}`,
    host: parsed.hostname.replace(/^www\./, ""),
    pathname: parsed.pathname || "/",
    search: parsed.search,
    internal,
  };
}

export function urlKey(host: string, pathname: string, search = ""): string {
  return `${host}${pathname.replace(/\/$/, "") || "/"}${search}`;
}

export function hostKey(host: string): string {
  return host;
}

export function samePage(
  a: NonNullable<ReturnType<typeof parseTabUrl>>,
  b: NonNullable<ReturnType<typeof parseTabUrl>>,
): boolean {
  return a.url === b.url;
}

export async function hashContext(workContext: string): Promise<string> {
  const bytes = new TextEncoder().encode(workContext.trim().toLowerCase());
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
