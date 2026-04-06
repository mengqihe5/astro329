export const prerender = false;

const COVER_QUERY_ALIASES = new Map([
  ["卡拉马佐夫兄弟", "The Brothers Karamazov"],
  ["素食者", "The Vegetarian"],
  ["百年孤独", "One Hundred Years of Solitude"],
]);

const COVER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const coverLookupCache = new Map<
  string,
  { expiresAt: number; imageUrl: string; provider: string; query: string }
>();

function normalizeQuery(input: unknown) {
  return String(input || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueries(titleRaw: string, slugRaw: string, coverQueryRaw: string) {
  const title = normalizeQuery(titleRaw);
  const slug = normalizeQuery(slugRaw);
  const coverQuery = normalizeQuery(coverQueryRaw);

  const queries: string[] = [];
  const push = (value: unknown) => {
    const text = normalizeQuery(value);
    if (!text) return;
    if (!queries.includes(text)) queries.push(text);
  };

  push(coverQuery);
  push(COVER_QUERY_ALIASES.get(title));
  push(COVER_QUERY_ALIASES.get(slug));
  push(title);
  push(slug);

  const shortTitle = title.replace(/[《》\[\]()（）].*$/, "").trim();
  push(shortTitle);

  return queries.slice(0, 8);
}

async function fetchJson(url: string) {
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
        "user-agent": "micah-blog-cover-resolver/1.0",
      },
    });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

function pickOpenLibraryImage(doc: any): string {
  if (doc && Number.isFinite(Number(doc.cover_i)) && Number(doc.cover_i) > 0) {
    return `https://covers.openlibrary.org/b/id/${Number(doc.cover_i)}-L.jpg`;
  }
  if (doc && Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    const isbn = String(doc.isbn[0] || "").trim();
    if (isbn) return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  }
  return "";
}

async function searchOpenLibrary(query: string) {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=10`;
  const payload: any = await fetchJson(url);
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  for (const doc of docs) {
    const imageUrl = pickOpenLibraryImage(doc);
    if (imageUrl) {
      return { imageUrl, provider: "OpenLibrary", query };
    }
  }
  return null;
}

function pickGoogleImage(item: any): string {
  const links = item?.volumeInfo?.imageLinks;
  if (!links || typeof links !== "object") return "";
  const raw = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail || "";
  return String(raw || "").replace(/^http:\/\//i, "https://");
}

async function searchGoogleBooks(query: string) {
  const q = `intitle:${query}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`;
  const payload: any = await fetchJson(url);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  for (const item of items) {
    const imageUrl = pickGoogleImage(item);
    if (imageUrl) {
      return { imageUrl, provider: "GoogleBooks", query };
    }
  }
  return null;
}

async function resolveOnlineCover(queries: string[]) {
  for (const query of queries) {
    const openLibrary = await searchOpenLibrary(query);
    if (openLibrary) return openLibrary;
  }
  for (const query of queries) {
    const google = await searchGoogleBooks(query);
    if (google) return google;
  }
  return null;
}

function buildJsonResponse(status: number, payload: Record<string, unknown>) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=21600",
    },
  });
}

export async function GET({ url }) {
  const title = String(url.searchParams.get("title") || "").trim();
  const slug = String(url.searchParams.get("slug") || "").trim();
  const query = String(url.searchParams.get("query") || "").trim();
  const queries = buildQueries(title, slug, query);

  if (!queries.length) {
    return buildJsonResponse(400, {
      ok: false,
      message: "missing-query",
      imageUrl: "",
    });
  }

  const cacheKey = queries.join("|");
  const now = Date.now();
  const cached = coverLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return buildJsonResponse(200, {
      ok: Boolean(cached.imageUrl),
      imageUrl: cached.imageUrl,
      provider: cached.provider,
      query: cached.query,
      cached: true,
    });
  }

  const source = await resolveOnlineCover(queries);
  const payload = {
    ok: Boolean(source?.imageUrl),
    imageUrl: source?.imageUrl || "",
    provider: source?.provider || "",
    query: source?.query || "",
    cached: false,
  };

  coverLookupCache.set(cacheKey, {
    expiresAt: now + COVER_CACHE_TTL_MS,
    imageUrl: payload.imageUrl,
    provider: payload.provider,
    query: payload.query,
  });

  return buildJsonResponse(200, payload);
}
