import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";

export const prerender = false;

const COVER_QUERY_ALIASES = new Map([
  ["卡拉马佐夫兄弟", "The Brothers Karamazov"],
  ["素食者", "The Vegetarian"],
  ["百年孤独", "One Hundred Years of Solitude"],
]);
const COVER_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".svg"];
const COVER_CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const PUBLIC_BOOK_COVERS_DIR = join(process.cwd(), "public", "app01", "book-covers");

let localPersistDisabled = false;
const coverLookupCache = new Map<
  string,
  { expiresAt: number; imageUrl: string; provider: string; query: string }
>();
const persistInFlight = new Map<string, Promise<string>>();

function normalizeQuery(input: unknown) {
  return String(input || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeFileBase(input: unknown) {
  return String(input || "")
    .replace(/[\u0000-\u001f]/g, "")
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
}

function pickCoverBaseName(slugRaw: string, titleRaw: string) {
  const slug = sanitizeFileBase(slugRaw);
  if (slug) return slug;
  const title = sanitizeFileBase(titleRaw);
  if (title) return title;
  return "";
}

function detectCoverExtension(urlValue: string, contentTypeRaw: string) {
  const contentType = String(contentTypeRaw || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (contentType === "image/webp") return ".webp";
  if (contentType === "image/png") return ".png";
  if (contentType === "image/jpeg" || contentType === "image/jpg") return ".jpg";
  if (contentType === "image/svg+xml") return ".svg";

  try {
    const urlExt = extname(new URL(urlValue).pathname).toLowerCase();
    if (COVER_EXTENSIONS.includes(urlExt)) return urlExt;
  } catch {
    // ignore invalid URL extension parse
  }

  return ".jpg";
}

function buildLocalCoverUrl(fileBase: string, ext: string) {
  return `/app01/book-covers/${encodeURIComponent(fileBase)}${ext}`;
}

function findExistingLocalCover(fileBase: string) {
  if (!fileBase) return "";
  for (const ext of COVER_EXTENSIONS) {
    const absPath = join(PUBLIC_BOOK_COVERS_DIR, `${fileBase}${ext}`);
    if (existsSync(absPath)) {
      return buildLocalCoverUrl(fileBase, ext);
    }
  }
  return "";
}

async function fetchImageBuffer(url: string) {
  const response = await fetch(url, {
    headers: {
      accept: "image/*,*/*;q=0.8",
      "user-agent": "micah-blog-cover-resolver/1.0",
    },
  });
  if (!response.ok) {
    throw new Error(`image-response-${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength <= 0) {
    throw new Error("empty-image");
  }

  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: String(response.headers.get("content-type") || ""),
    finalUrl: String(response.url || url),
  };
}

async function persistCoverToPublicDir(fileBase: string, sourceUrl: string) {
  if (!fileBase || !sourceUrl || localPersistDisabled) return "";

  const existing = findExistingLocalCover(fileBase);
  if (existing) return existing;

  const persistKey = `${fileBase}|${sourceUrl}`;
  if (persistInFlight.has(persistKey)) {
    return persistInFlight.get(persistKey) as Promise<string>;
  }

  const task = (async () => {
    try {
      mkdirSync(PUBLIC_BOOK_COVERS_DIR, { recursive: true });
      const image = await fetchImageBuffer(sourceUrl);
      const ext = detectCoverExtension(image.finalUrl, image.contentType);
      const outputPath = join(PUBLIC_BOOK_COVERS_DIR, `${fileBase}${ext}`);
      writeFileSync(outputPath, image.buffer);
      return buildLocalCoverUrl(fileBase, ext);
    } catch (error: any) {
      const code = String(error?.code || "");
      if (code === "EROFS" || code === "EACCES" || code === "EPERM") {
        localPersistDisabled = true;
      }
      return "";
    }
  })();

  persistInFlight.set(persistKey, task);
  try {
    return await task;
  } finally {
    persistInFlight.delete(persistKey);
  }
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
  const fileBase = pickCoverBaseName(slug, title);

  const localCover = findExistingLocalCover(fileBase);
  if (localCover) {
    return buildJsonResponse(200, {
      ok: true,
      imageUrl: localCover,
      provider: "Local",
      query: fileBase,
      cached: false,
      persisted: false,
    });
  }

  const queries = buildQueries(title, slug, query);
  if (!queries.length) {
    return buildJsonResponse(400, {
      ok: false,
      message: "missing-query",
      imageUrl: "",
      persisted: false,
    });
  }

  const cacheKey = `${fileBase}|${queries.join("|")}`;
  const now = Date.now();
  const cached = coverLookupCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return buildJsonResponse(200, {
      ok: Boolean(cached.imageUrl),
      imageUrl: cached.imageUrl,
      provider: cached.provider,
      query: cached.query,
      cached: true,
      persisted: cached.provider === "Local",
    });
  }

  const source = await resolveOnlineCover(queries);
  let resolvedImageUrl = String(source?.imageUrl || "");
  let provider = String(source?.provider || "");
  const resolvedQuery = String(source?.query || "");
  let persisted = false;

  if (resolvedImageUrl) {
    const persistedUrl = await persistCoverToPublicDir(fileBase, resolvedImageUrl);
    if (persistedUrl) {
      resolvedImageUrl = persistedUrl;
      provider = "Local";
      persisted = true;
    }
  }

  const payload = {
    ok: Boolean(resolvedImageUrl),
    imageUrl: resolvedImageUrl,
    provider,
    query: resolvedQuery,
    cached: false,
    persisted,
  };

  coverLookupCache.set(cacheKey, {
    expiresAt: now + COVER_CACHE_TTL_MS,
    imageUrl: payload.imageUrl,
    provider: payload.provider,
    query: payload.query,
  });

  return buildJsonResponse(200, payload);
}
