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

export function isSearchHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  if (
    h === "bing.com" ||
    h === "duckduckgo.com" ||
    h === "duck.com" ||
    h === "yahoo.com" ||
    h === "search.yahoo.com" ||
    h === "brave.com" ||
    h === "search.brave.com" ||
    h === "startpage.com" ||
    h === "ecosia.org" ||
    h === "baidu.com" ||
    h === "yandex.com" ||
    h === "yandex.ru"
  ) {
    return true;
  }
  if (h === "google.com" || h.startsWith("google.") || h.endsWith(".google.com")) {
    return true;
  }
  return false;
}

export function hrefKey(raw: string | undefined): string | null {
  return parseTabUrl(raw)?.url ?? null;
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
