export type ParsedUrl = {
  url: string;
  host: string;
  pathname: string;
  search: string;
  internal: boolean;
};

export function parseTabUrl(raw: string | undefined): ParsedUrl | null {
  if (!raw) return null;
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  return {
    url: `${parsed.origin}${parsed.pathname}${parsed.search}`,
    host: parsed.hostname.replace(/^www\./, ""),
    pathname: parsed.pathname || "/",
    search: parsed.search,
    internal: parsed.protocol !== "http:" && parsed.protocol !== "https:",
  };
}

export function urlKey({ host, pathname, search }: ParsedUrl): string {
  return `${host}${pathname.replace(/\/$/, "") || "/"}${search}`;
}

const SEARCH_HOSTS = new Set([
  "bing.com",
  "duckduckgo.com",
  "duck.com",
  "yahoo.com",
  "search.yahoo.com",
  "brave.com",
  "search.brave.com",
  "startpage.com",
  "ecosia.org",
  "baidu.com",
  "yandex.com",
  "yandex.ru",
]);

/** Result pages stay per query. Country Google domains count; Docs and Gmail do not. */
export function isSearchHost(host: string): boolean {
  const h = host.replace(/^www\./, "").toLowerCase();
  return SEARCH_HOSTS.has(h) || h.startsWith("google.");
}

export async function hashContext(workContext: string): Promise<string> {
  const normalized = workContext.trim().toLowerCase();
  if (!normalized) return "";
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(normalized));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}
