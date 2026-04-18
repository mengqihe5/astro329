import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import sharp from "sharp";

const REVIEW_DIR = resolve(process.cwd(), "content", "reviews");
const COVER_DIR = resolve(process.cwd(), "public", "app01", "book-covers");
const COVER_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".svg"];
const COVER_QUERY_ALIASES = new Map([
  ["卡拉马佐夫兄弟", "The Brothers Karamazov"],
  ["素食者", "The Vegetarian"],
  ["百年孤独", "One Hundred Years of Solitude"],
]);

const argv = process.argv.slice(2);
const force = argv.includes("--force");
const dryRun = argv.includes("--dry-run");

mkdirSync(COVER_DIR, { recursive: true });

function parseFrontMatter(rawText) {
  const metadata = {};
  const lines = String(rawText || "").split(/\r?\n/);

  for (const line of lines) {
    const text = line.trim();
    if (!text) break;
    const colonIndex = text.indexOf(":");
    if (colonIndex <= 0) break;
    const key = text.slice(0, colonIndex).trim().toLowerCase();
    const value = text.slice(colonIndex + 1).trim();
    metadata[key] = value;
  }

  return metadata;
}

function getReviewItems() {
  const names = readdirSync(REVIEW_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === ".md")
    .map((entry) => entry.name)
    .filter((name) => name.toLowerCase() !== "readme.md");

  return names.map((fileName) => {
    const filePath = join(REVIEW_DIR, fileName);
    const raw = readFileSync(filePath, "utf8");
    const metadata = parseFrontMatter(raw);
    const slug = basename(fileName, ".md");
    const title = String(metadata.title || "").trim() || slug;
    const coverQuery = String(metadata.cover_query || metadata.coverquery || "").trim();
    return { fileName, filePath, slug, title, coverQuery };
  });
}

function findExistingCoverPath(slug) {
  for (const ext of COVER_EXTS) {
    const path = join(COVER_DIR, `${slug}${ext}`);
    if (existsSync(path)) return path;
  }
  return "";
}

function normalizeQuery(input) {
  return String(input || "")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function buildQueries(title, slug, coverQueryRaw) {
  const queries = [];
  const push = (value) => {
    const text = normalizeQuery(value);
    if (!text) return;
    if (!queries.includes(text)) queries.push(text);
  };

  push(coverQueryRaw);
  push(COVER_QUERY_ALIASES.get(normalizeQuery(title)));
  push(COVER_QUERY_ALIASES.get(normalizeQuery(slug)));
  push(title);
  push(slug);

  const titleWithoutSub = normalizeQuery(title).replace(/[《》\[\]()（）].*$/, "").trim();
  push(titleWithoutSub);

  return queries;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "micah-blog-cover-bot/1.0",
      accept: "application/json",
    },
  });
  if (!response.ok) return null;
  return response.json();
}

function pickOpenLibraryImage(doc) {
  if (doc && Number.isFinite(Number(doc.cover_i)) && Number(doc.cover_i) > 0) {
    return `https://covers.openlibrary.org/b/id/${Number(doc.cover_i)}-L.jpg`;
  }
  if (doc && Array.isArray(doc.isbn) && doc.isbn.length > 0) {
    const isbn = String(doc.isbn[0] || "").trim();
    if (isbn) return `https://covers.openlibrary.org/b/isbn/${encodeURIComponent(isbn)}-L.jpg`;
  }
  return "";
}

async function searchOpenLibrary(query) {
  const url = `https://openlibrary.org/search.json?title=${encodeURIComponent(query)}&limit=10`;
  const payload = await fetchJson(url);
  const docs = Array.isArray(payload?.docs) ? payload.docs : [];
  for (const doc of docs) {
    const imageUrl = pickOpenLibraryImage(doc);
    if (imageUrl) {
      return { imageUrl, provider: "OpenLibrary", query };
    }
  }
  return null;
}

function pickGoogleImage(item) {
  const links = item?.volumeInfo?.imageLinks;
  if (!links || typeof links !== "object") return "";
  const raw = links.extraLarge || links.large || links.medium || links.thumbnail || links.smallThumbnail || "";
  return String(raw || "").replace(/^http:\/\//i, "https://");
}

async function searchGoogleBooks(query) {
  const q = `intitle:${query}`;
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(q)}&maxResults=10&printType=books`;
  const payload = await fetchJson(url);
  const items = Array.isArray(payload?.items) ? payload.items : [];
  for (const item of items) {
    const imageUrl = pickGoogleImage(item);
    if (imageUrl) {
      return { imageUrl, provider: "GoogleBooks", query };
    }
  }
  return null;
}

async function resolveCoverSource(queries) {
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

async function fetchImageBuffer(url) {
  const response = await fetch(url, {
    headers: {
      "user-agent": "micah-blog-cover-bot/1.0",
      accept: "image/*,*/*;q=0.8",
      referer: "https://openlibrary.org/",
    },
  });

  if (!response.ok) {
    throw new Error(`image-response-${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  if (!arrayBuffer || arrayBuffer.byteLength === 0) {
    throw new Error("empty-image");
  }
  return Buffer.from(arrayBuffer);
}

async function saveCover(slug, imageBuffer) {
  const outputPath = join(COVER_DIR, `${slug}.jpg`);
  const outputBuffer = await sharp(imageBuffer, { failOn: "none" })
    .rotate()
    .resize({ width: 576, height: 834, fit: "cover", position: "center" })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();

  if (!dryRun) {
    writeFileSync(outputPath, outputBuffer);
  }

  return outputPath;
}

async function run() {
  const reviews = getReviewItems();
  if (!reviews.length) {
    console.log("[books:covers] 没有找到书评 md 文件。");
    return;
  }

  let created = 0;
  let skipped = 0;
  let failed = 0;

  for (const item of reviews) {
    const existingPath = findExistingCoverPath(item.slug);
    if (existingPath && !force) {
      skipped += 1;
      console.log(`[skip] ${item.slug} -> 已有封面 (${basename(existingPath)})`);
      continue;
    }

    const queries = buildQueries(item.title, item.slug, item.coverQuery);
    if (!queries.length) {
      failed += 1;
      console.log(`[fail] ${item.slug} -> 无可用搜索关键词`);
      continue;
    }

    try {
      const source = await resolveCoverSource(queries);
      if (!source?.imageUrl) {
        failed += 1;
        console.log(`[fail] ${item.slug} -> 未找到在线封面`);
        continue;
      }

      const imageBuffer = await fetchImageBuffer(source.imageUrl);
      const outputPath = await saveCover(item.slug, imageBuffer);
      created += 1;
      console.log(`[ok] ${item.slug} -> ${basename(outputPath)} (${source.provider}: ${source.query})`);
    } catch (error) {
      failed += 1;
      console.log(`[fail] ${item.slug} -> ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n[books:covers] 完成：新增 ${created}，跳过 ${skipped}，失败 ${failed}${dryRun ? " (dry-run)" : ""}`);
}

run().catch((error) => {
  console.error(`[books:covers] 执行失败: ${error instanceof Error ? error.stack || error.message : String(error)}`);
  process.exitCode = 1;
});
