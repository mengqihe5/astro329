import { fileURLToPath } from "node:url";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { marked } from "marked";

export const SITE_PROFILE = {
  nickname: "Micah Hale",
  avatarText: "M",
};

export const NAV_ITEMS = [
  { title: "首页", href: "/", icon: "home", activePrefixes: ["/"] },
  { title: "文章", href: "/articles/", icon: "article", activePrefixes: ["/articles"] },
  { title: "游戏", href: "/steam/", icon: "gamepad", activePrefixes: ["/steam"] },
  { title: "书架", href: "/books/", icon: "book", activePrefixes: ["/books"] },
];

const FALLBACK_STEAM_GAMES = [
  {
    appId: 1145360,
    name: "Hades",
    playtimeHours: 48.0,
    recentHours: 2.5,
    coverUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/1145360/header.jpg",
  },
  {
    appId: 413150,
    name: "Stardew Valley",
    playtimeHours: 76.0,
    recentHours: 0.0,
    coverUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/413150/header.jpg",
  },
  {
    appId: 814380,
    name: "Sekiro: Shadows Die Twice",
    playtimeHours: 30.0,
    recentHours: 0.0,
    coverUrl: "https://cdn.cloudflare.steamstatic.com/steam/apps/814380/header.jpg",
  },
];

export const BLOG_START_MONTH = "2026-03";
const STEAM_CACHE_TTL_MS = 1 * 60 * 1000;
const STEAM_TIME_ZONE = "Asia/Hong_Kong";
const STEAM_ZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const STEAM_DAY_MS = 24 * 60 * 60 * 1000;
const STEAM_STRICT_GAP_SECONDS = 6 * 60 * 60;
const STEAM_MAX_DISTRIBUTABLE_GAP_SECONDS = 48 * 60 * 60;
const steamOwnedGamesCache = new Map();

const ARTICLE_COVER_BY_SLUG = {
  "django-blog-day-1": "/app01/article-covers/cover-django.svg",
  "reading-notes-2026-03": "/app01/article-covers/cover-reading.svg",
  "steam-log-method": "/app01/article-covers/cover-steam.svg",
};
const DEFAULT_ARTICLE_COVER = "/app01/article-covers/cover-default.svg";
const ARTICLE_REQUIRED_KEYS = ["title", "date", "tags", "cover", "draft", "summary"];

const BOOK_COVER_EXTENSIONS = [".webp", ".png", ".jpg", ".jpeg", ".svg"];

const ARTICLE_FILES = import.meta.glob("../../content/articles/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});
const REVIEW_FILES = import.meta.glob("../../content/reviews/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
});
const STEAM_MONTHLY_FILE_URL = new URL("../../content/steam/monthly_hours.json", import.meta.url);
const STEAM_DAILY_TOTALS_FILE_URL = new URL("../../content/steam/daily_totals.json", import.meta.url);

marked.setOptions({
  gfm: true,
  breaks: true,
});

function nowMonth() {
  return steamDateKeyFromUtcMs(Date.now()).slice(0, 7);
}

function monthKeyToIndex(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

function clampMonthKey(value, minMonth, maxMonth) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) {
    return maxMonth;
  }
  const valueIndex = monthKeyToIndex(value);
  const minIndex = monthKeyToIndex(minMonth);
  const maxIndex = monthKeyToIndex(maxMonth);
  if (valueIndex === null || minIndex === null || maxIndex === null) return maxMonth;
  if (valueIndex < minIndex) return minMonth;
  if (valueIndex > maxIndex) return maxMonth;
  return value;
}

function formatLocalDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return year + "-" + month + "-" + day;
}

function slugFromPath(pathName) {
  const match = pathName.match(/([^/\\]+)\.md$/);
  return match ? match[1] : "";
}

function getMtime(pathName) {
  try {
    const fullPath = fileURLToPath(new URL(pathName, import.meta.url));
    return statSync(fullPath).mtimeMs;
  } catch {
    return 0;
  }
}

function parseFrontMatter(rawText) {
  const lines = rawText.split(/\r?\n/);
  const metadata = {};
  let bodyStartIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      bodyStartIndex = index + 1;
      break;
    }
    if (!line.includes(":")) {
      bodyStartIndex = index;
      break;
    }
    const [key, ...rest] = line.split(":");
    metadata[key.trim().toLowerCase()] = rest.join(":").trim();
    bodyStartIndex = index + 1;
  }

  const body = lines.slice(bodyStartIndex).join("\n").trimEnd();
  return { metadata, body };
}

function parseTags(rawTags) {
  if (!rawTags) return [];
  return String(rawTags)
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function parseDraft(rawValue) {
  return /^(1|true|yes|on)$/i.test(String(rawValue || "").trim());
}

function normalizeArticleDate(rawValue) {
  const value = String(rawValue || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "1970-01-01";
}

function resolveArticleCover(rawCover, slug) {
  const value = String(rawCover || "").trim();
  if (value) {
    if (/^https?:\/\//i.test(value) || value.startsWith("/")) return value;
    return `/app01/article-covers/${value}`;
  }
  return ARTICLE_COVER_BY_SLUG[slug] || DEFAULT_ARTICLE_COVER;
}

function hasRequiredArticleFrontmatter(metadata) {
  return ARTICLE_REQUIRED_KEYS.every((key) => Object.prototype.hasOwnProperty.call(metadata, key));
}

export function formatMonthLabel(rawMonth) {
  const match = String(rawMonth || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return rawMonth;
  return `${match[1]} 年 ${match[2]} 月`;
}

export function formatMonthCompact(rawMonth) {
  const match = String(rawMonth || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return rawMonth;
  return `${Number(match[1])}年${Number(match[2])}月`;
}

export function buildMonthRangeOptions(minMonth, maxMonth) {
  const minIndex = monthKeyToIndex(minMonth);
  const maxIndex = monthKeyToIndex(maxMonth);
  if (minIndex === null || maxIndex === null) return [];

  const start = Math.min(minIndex, maxIndex);
  const end = Math.max(minIndex, maxIndex);
  const rows = [];

  for (let index = end; index >= start; index -= 1) {
    const year = Math.floor(index / 12);
    const month = String((index % 12) + 1).padStart(2, "0");
    const value = `${year}-${month}`;
    rows.push({
      value,
      label: formatMonthLabel(value),
      compact: formatMonthCompact(value),
    });
  }

  return rows;
}

function escapeSvgText(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function hashText(input) {
  let hash = 0;
  for (const char of String(input || "")) {
    hash = (hash * 33 + char.codePointAt(0)) % 3600;
  }
  return hash;
}

function buildAutoBookCover(slug, title, monthRaw) {
  const seed = hashText(`${slug}|${title}|${monthRaw}`);
  const hueA = seed % 360;
  const hueB = (hueA + 38) % 360;
  const hueC = (hueA + 92) % 360;
  const badgeText = escapeSvgText(Array.from(String(title || slug || "书")).slice(0, 2).join(""));
  const monthText = escapeSvgText(formatMonthLabel(monthRaw || "未知月份"));

  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 576 834">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="hsl(${hueA} 65% 45%)"/>
      <stop offset="55%" stop-color="hsl(${hueB} 62% 35%)"/>
      <stop offset="100%" stop-color="hsl(${hueC} 58% 28%)"/>
    </linearGradient>
    <linearGradient id="shine" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="rgba(255,255,255,0.45)"/>
      <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
    </linearGradient>
  </defs>
  <rect width="576" height="834" fill="url(#bg)"/>
  <circle cx="484" cy="112" r="168" fill="url(#shine)" opacity="0.45"/>
  <rect x="48" y="610" width="480" height="162" rx="22" fill="rgba(7,13,28,0.54)" stroke="rgba(255,255,255,0.24)"/>
  <text x="72" y="694" font-size="36" fill="rgba(236,244,255,0.92)" font-family="Arial, sans-serif">${monthText}</text>
  <rect x="58" y="58" width="142" height="142" rx="24" fill="rgba(7,13,28,0.42)" stroke="rgba(255,255,255,0.28)"/>
  <text x="129" y="146" text-anchor="middle" font-size="66" font-weight="700" fill="rgba(248,252,255,0.96)" font-family="Arial, sans-serif">${badgeText}</text>
</svg>`.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function buildBookCoverCandidates(slug, title) {
  const baseNames = [];
  const pushBase = (value) => {
    const text = String(value || "").trim();
    if (!text) return;
    if (!baseNames.includes(text)) baseNames.push(text);
  };

  pushBase(slug);
  pushBase(title);

  const candidates = [];
  for (const name of baseNames) {
    const encodedName = encodeURIComponent(name);
    for (const ext of BOOK_COVER_EXTENSIONS) {
      candidates.push(`/app01/book-covers/${encodedName}${ext}`);
    }
  }
  return candidates;
}

function findBookCover(slug, title, monthRaw) {
  const coverCandidates = buildBookCoverCandidates(slug, title);
  const coverFallback = buildAutoBookCover(slug, title, monthRaw);
  return {
    cover: coverCandidates[0] || coverFallback,
    coverCandidates,
    coverFallback,
  };
}

function buildSummary(metadata, body) {
  if (metadata.summary) return metadata.summary;
  const compact = body.split(/\s+/).join(" ");
  return compact.length > 90 ? `${compact.slice(0, 90)}...` : compact;
}

function renderMarkdown(input) {
  return marked.parse(String(input || ""));
}

export function loadArticles(order = "desc", options = {}) {
  const includeDraft = Boolean(options.includeDraft);
  const rows = Object.entries(ARTICLE_FILES).map(([pathName, rawText]) => {
    const slug = slugFromPath(pathName);
    const { metadata, body } = parseFrontMatter(String(rawText || ""));
    const title = String(metadata.title || "").trim() || slug.replace(/-/g, " ");
    const date = normalizeArticleDate(metadata.date);
    const tags = parseTags(metadata.tags);
    const cover = resolveArticleCover(metadata.cover, slug);
    const draft = parseDraft(metadata.draft);

    if (!hasRequiredArticleFrontmatter(metadata)) {
      console.warn(`[articles] missing frontmatter keys in ${slug}.md. Expected: ${ARTICLE_REQUIRED_KEYS.join(", ")}`);
    }

    return {
      slug,
      title,
      date,
      summary: buildSummary(metadata, body),
      content: body,
      contentHtml: renderMarkdown(body),
      tags,
      cover,
      draft,
      mtime: getMtime(pathName),
    };
  });

  const visibleRows = includeDraft ? rows : rows.filter((row) => !row.draft);

  const reverse = order !== "asc";
  visibleRows.sort((a, b) => {
    const dateDelta = a.date.localeCompare(b.date);
    if (dateDelta !== 0) return reverse ? -dateDelta : dateDelta;
    return reverse ? b.mtime - a.mtime : a.mtime - b.mtime;
  });
  return visibleRows;
}

export function loadBooks(order = "desc") {
  const rows = [];
  for (const [pathName, rawText] of Object.entries(REVIEW_FILES)) {
    const slug = slugFromPath(pathName);
    if (slug.toLowerCase() === "readme") continue;
    const { metadata, body } = parseFrontMatter(String(rawText || ""));
    const monthRaw = metadata.month || "未知月份";
    const bookTitle = metadata.title || slug.replace(/-/g, " ");
    const parsedTags = parseTags(metadata.tags);
    const coverInfo = findBookCover(slug, bookTitle, monthRaw);
    rows.push({
      slug,
      title: bookTitle,
      monthRaw,
      monthLabel: formatMonthLabel(monthRaw),
      cover: coverInfo.cover,
      coverCandidates: coverInfo.coverCandidates,
      coverFallback: coverInfo.coverFallback,
      tags: parsedTags.length > 0 ? parsedTags : ["未分类"],
      reviewText: body,
    });
  }

  rows.sort((a, b) => {
    const delta = String(a.monthRaw).localeCompare(String(b.monthRaw));
    return order === "asc" ? delta : -delta;
  });
  return rows;
}

export function groupByMonth(items, keyName) {
  const seen = [];
  const buckets = new Map();

  for (const item of items) {
    const monthKey = item[keyName];
    if (!buckets.has(monthKey)) {
      buckets.set(monthKey, []);
      seen.push(monthKey);
    }
    buckets.get(monthKey).push(item);
  }

  return seen.map((monthKey) => ({
    monthRaw: monthKey,
    monthLabel: formatMonthLabel(monthKey),
    items: buckets.get(monthKey) || [],
  }));
}

export function addRatio(rows, valueKey) {
  if (!rows || rows.length === 0) return [];
  const maxValue = Math.max(...rows.map((row) => Number(row[valueKey] || 0)));
  if (maxValue <= 0) {
    return rows.map((row) => ({ ...row, ratio: 0 }));
  }
  return rows.map((row) => ({
    ...row,
    ratio: Math.round(((Number(row[valueKey] || 0) / maxValue) * 100) * 100) / 100,
  }));
}

export function getMonthBounds() {
  const current = nowMonth();
  const min = monthKeyToIndex(BLOG_START_MONTH) !== null ? BLOG_START_MONTH : current;
  return monthKeyToIndex(min) <= monthKeyToIndex(current)
    ? { minMonth: min, maxMonth: current }
    : { minMonth: current, maxMonth: current };
}

export function resolveMonth(rawMonth, minMonth, maxMonth) {
  const bounds = minMonth && maxMonth ? { minMonth, maxMonth } : getMonthBounds();
  return clampMonthKey(rawMonth, bounds.minMonth, bounds.maxMonth);
}

export function collectAvailableMonths(articles, books) {
  const bounds = getMonthBounds();
  const months = new Set([bounds.maxMonth]);
  for (const article of articles) {
    if (String(article.date).length >= 7) months.add(article.date.slice(0, 7));
  }
  for (const book of books) {
    if (/^\d{4}-\d{2}$/.test(book.monthRaw)) months.add(book.monthRaw);
  }
  return Array.from(months)
    .filter((monthKey) => monthKeyToIndex(monthKey) !== null)
    .map((monthKey) => clampMonthKey(monthKey, bounds.minMonth, bounds.maxMonth))
    .sort((a, b) => b.localeCompare(a))
    .map((value) => ({ value, label: formatMonthLabel(value) }));
}

export function getNavItems(currentPath = "/") {
  return NAV_ITEMS.map((item) => {
    const active = item.activePrefixes.some((prefix) => {
      if (prefix === "/") return currentPath === "/";
      return currentPath.startsWith(prefix);
    });
    return { ...item, active };
  });
}

export function buildArticleCalendar(monthKey, monthArticles) {
  const [year, month] = monthKey.split("-").map(Number);
  const dayCounts = new Map();
  for (const article of monthArticles) {
    const key = article.date;
    dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
  }

  const maxCount = Math.max(0, ...Array.from(dayCounts.values()));

  const levelFor = (count) => {
    if (count <= 0) return "none";
    if (maxCount <= 1) return "low";
    const ratio = count / maxCount;
    if (ratio < 0.34) return "low";
    if (ratio < 0.67) return "mid";
    return "high";
  };

  const firstDay = new Date(year, month - 1, 1);
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = firstWeekday; i > 0; i -= 1) {
    const d = new Date(year, month - 1, 1 - i);
    const dateStr = formatLocalDate(d);
    cells.push({ date: dateStr, day: d.getDate(), inMonth: false, count: 0, level: "none" });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const d = new Date(year, month - 1, day);
    const dateStr = formatLocalDate(d);
    const count = dayCounts.get(dateStr) || 0;
    cells.push({ date: dateStr, day, inMonth: true, count, level: levelFor(count) });
  }

  let nextMonthDay = 1;
  while (cells.length % 7 !== 0) {
    const d = new Date(year, month, nextMonthDay);
    const dateStr = formatLocalDate(d);
    cells.push({ date: dateStr, day: d.getDate(), inMonth: false, count: 0, level: "none" });
    nextMonthDay += 1;
  }

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) {
    weeks.push(cells.slice(i, i + 7));
  }
  return weeks;
}

function readJsonFile(fileUrl, fallbackValue) {
  try {
    const raw = readFileSync(fileURLToPath(fileUrl), "utf8");
    const parsed = JSON.parse(String(raw || ""));
    return typeof parsed === "object" && parsed !== null ? parsed : fallbackValue;
  } catch {
    return fallbackValue;
  }
}

function writeJsonFile(fileUrl, value) {
  try {
    const serialized = JSON.stringify(value, null, 2) + "\n";
    writeFileSync(fileURLToPath(fileUrl), serialized, "utf8");
    return true;
  } catch {
    return false;
  }
}

function loadSteamMonthlyHours() {
  return readJsonFile(STEAM_MONTHLY_FILE_URL, {});
}

function saveSteamMonthlyHours(value) {
  return writeJsonFile(STEAM_MONTHLY_FILE_URL, value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function steamDateKeyFromUtcMs(utcMs) {
  const shifted = new Date(Number(utcMs) + STEAM_ZONE_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = pad2(shifted.getUTCMonth() + 1);
  const day = pad2(shifted.getUTCDate());
  return `${year}-${month}-${day}`;
}

function steamTodayKey() {
  return steamDateKeyFromUtcMs(Date.now());
}

function steamNowMonth() {
  return steamTodayKey().slice(0, 7);
}

function parseDateKey(input) {
  const match = String(input || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function steamDayStartUtcMs(dateKey) {
  const parsed = parseDateKey(dateKey);
  if (!parsed) return null;
  return Date.UTC(parsed.year, parsed.month - 1, parsed.day, 0, 0, 0, 0) - STEAM_ZONE_OFFSET_MS;
}

function steamDayEndUtcMs(dateKey) {
  const dayStart = steamDayStartUtcMs(dateKey);
  if (dayStart === null) return null;
  return dayStart + STEAM_DAY_MS - 1000;
}

function shiftSteamDate(dateKey, step) {
  const dayStart = steamDayStartUtcMs(dateKey);
  if (dayStart === null) return dateKey;
  return steamDateKeyFromUtcMs(dayStart + Number(step || 0) * STEAM_DAY_MS);
}

function shiftMonth(monthKey, step) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1 + Number(step || 0), 1));
  return `${base.getUTCFullYear()}-${pad2(base.getUTCMonth() + 1)}`;
}

function steamMonthStartUtcMs(monthKey) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, 1, 0, 0, 0, 0) - STEAM_ZONE_OFFSET_MS;
}

function normalizeMonthHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(number, 0) * 10) / 10;
}

function normalizeHoursMap(input) {
  const map = typeof input === "object" && input !== null ? input : {};
  const normalized = {};
  for (const [key, rawValue] of Object.entries(map)) {
    const value = normalizeMonthHours(rawValue);
    if (value !== null) {
      normalized[String(key)] = value;
    }
  }
  return normalized;
}

function normalizeMinutes(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}

function normalizeMinutesMap(input) {
  const map = typeof input === "object" && input !== null ? input : {};
  const normalized = {};
  for (const [key, rawValue] of Object.entries(map)) {
    const value = normalizeMinutes(rawValue);
    if (value !== null) {
      normalized[String(key)] = value;
    }
  }
  return normalized;
}

function hoursToMinutes(hoursValue) {
  const hours = Number(hoursValue);
  if (!Number.isFinite(hours)) return null;
  return Math.max(0, Math.round(hours * 60));
}

function minutesToHours(minutesValue) {
  const minutes = Number(minutesValue);
  if (!Number.isFinite(minutes)) return null;
  return Math.round((Math.max(0, minutes) / 60) * 10) / 10;
}

function minutesMapToHoursMap(minutesMap) {
  const source = typeof minutesMap === "object" && minutesMap !== null ? minutesMap : {};
  const result = {};
  for (const [key, rawMinutes] of Object.entries(source)) {
    const value = minutesToHours(rawMinutes);
    if (value && value > 0) {
      result[String(key)] = value;
    }
  }
  return result;
}

function sameMinutesMap(left, right) {
  const a = normalizeMinutesMap(left);
  const b = normalizeMinutesMap(right);
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, key)) return false;
    if (a[key] !== b[key]) return false;
  }
  return true;
}

function normalizeSnapshot(rawSnapshot) {
  if (!rawSnapshot || typeof rawSnapshot !== "object") return null;
  const capturedAtRaw = String(rawSnapshot.capturedAt || "").trim();
  const capturedAtMs = Date.parse(capturedAtRaw);
  if (!Number.isFinite(capturedAtMs)) return null;
  let totalsMin = {};
  if (rawSnapshot.totalsMin && typeof rawSnapshot.totalsMin === "object") {
    totalsMin = normalizeMinutesMap(rawSnapshot.totalsMin);
  } else if (rawSnapshot.totals && typeof rawSnapshot.totals === "object") {
    totalsMin = normalizeMinutesMap(rawSnapshot.totals);
  } else if (rawSnapshot.totalsHours && typeof rawSnapshot.totalsHours === "object") {
    const fromHours = {};
    for (const [key, rawHours] of Object.entries(rawSnapshot.totalsHours)) {
      const minutes = hoursToMinutes(rawHours);
      if (minutes !== null) {
        fromHours[String(key)] = minutes;
      }
    }
    totalsMin = fromHours;
  }
  return {
    capturedAt: new Date(capturedAtMs).toISOString(),
    capturedAtMs,
    totalsMin,
  };
}

function legacyDaysToSnapshots(days) {
  const source = typeof days === "object" && days !== null ? days : {};
  const snapshots = [];
  for (const [dateKey, hoursMap] of Object.entries(source)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) continue;
    const capturedAtMs = steamDayEndUtcMs(dateKey);
    if (capturedAtMs === null) continue;
    const totalsMin = {};
    const normalizedHours = normalizeHoursMap(hoursMap);
    for (const [key, rawHours] of Object.entries(normalizedHours)) {
      const minutes = hoursToMinutes(rawHours);
      if (minutes !== null) {
        totalsMin[String(key)] = minutes;
      }
    }
    snapshots.push({
      capturedAt: new Date(capturedAtMs).toISOString(),
      capturedAtMs,
      totalsMin,
    });
  }
  return snapshots;
}

function dedupeSnapshots(snapshots) {
  const result = [];
  for (const snapshot of snapshots) {
    const previous = result[result.length - 1];
    if (previous && previous.capturedAt === snapshot.capturedAt) {
      result[result.length - 1] = snapshot;
      continue;
    }
    result.push(snapshot);
  }
  return result;
}

function normalizeSnapshots(input) {
  const rows = Array.isArray(input) ? input : [];
  const normalized = [];
  for (const row of rows) {
    const snapshot = normalizeSnapshot(row);
    if (snapshot) normalized.push(snapshot);
  }
  normalized.sort((a, b) => a.capturedAtMs - b.capturedAtMs);
  return dedupeSnapshots(normalized);
}

function snapshotSourceToArray(source) {
  if (Array.isArray(source)) return source;
  if (source && typeof source === "object" && Array.isArray(source.snapshots)) return source.snapshots;
  if (source && typeof source === "object" && source.days) return legacyDaysToSnapshots(source.days);
  return [];
}

function loadSteamDailyTotals() {
  const payload = readJsonFile(STEAM_DAILY_TOTALS_FILE_URL, {});
  const sourceSnapshots = normalizeSnapshots(payload.snapshots);
  const legacySnapshots = sourceSnapshots.length === 0 ? normalizeSnapshots(legacyDaysToSnapshots(payload.days)) : [];
  const snapshots = sourceSnapshots.length > 0 ? sourceSnapshots : legacySnapshots;
  return {
    timezone: typeof payload.timezone === "string" ? payload.timezone : STEAM_TIME_ZONE,
    snapshots,
    updatedAt: typeof payload.updatedAt === "string" ? payload.updatedAt : "",
  };
}

function saveSteamDailyTotals(value) {
  const snapshots = normalizeSnapshots(value && value.snapshots);
  return writeJsonFile(STEAM_DAILY_TOTALS_FILE_URL, {
    version: 2,
    timezone: STEAM_TIME_ZONE,
    updatedAt: typeof value?.updatedAt === "string" ? value.updatedAt : new Date().toISOString(),
    snapshots: snapshots.map((snapshot) => ({
      capturedAt: snapshot.capturedAt,
      totalsMin: snapshot.totalsMin,
    })),
  });
}

function listSnapshotDates(snapshotSource) {
  const snapshots = normalizeSnapshots(snapshotSourceToArray(snapshotSource));
  const dates = new Set();
  for (const snapshot of snapshots) {
    dates.add(steamDateKeyFromUtcMs(snapshot.capturedAtMs));
  }
  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

function buildPositiveDeltaMinutes(startTotals, endTotals) {
  const startMap = normalizeMinutesMap(startTotals);
  const endMap = normalizeMinutesMap(endTotals);
  const delta = {};
  const keys = new Set([...Object.keys(startMap), ...Object.keys(endMap)]);
  for (const key of keys) {
    const startValue = Number(startMap[key] || 0);
    const endValue = Number(endMap[key] || 0);
    const diff = endValue - startValue;
    if (diff > 0) {
      delta[key] = diff;
    }
  }
  return delta;
}

function overlapMs(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

function allocateMinutesByDay(startMs, endMs, deltaMinutes) {
  const totalMs = endMs - startMs;
  if (totalMs <= 0 || deltaMinutes <= 0) return {};
  const allocations = {};
  let cursor = startMs;
  while (cursor < endMs) {
    const dayKey = steamDateKeyFromUtcMs(cursor);
    const nextDayStart = steamDayStartUtcMs(shiftSteamDate(dayKey, 1));
    if (nextDayStart === null) break;
    const segmentEnd = Math.min(endMs, nextDayStart);
    const segmentMs = Math.max(0, segmentEnd - cursor);
    if (segmentMs > 0) {
      allocations[dayKey] = (allocations[dayKey] || 0) + (deltaMinutes * segmentMs) / totalMs;
    }
    cursor = segmentEnd > cursor ? segmentEnd : cursor + 1;
  }
  return allocations;
}

function withLiveSnapshot(snapshots, monthKey, currentTotalsMap) {
  const rows = normalizeSnapshots(snapshots);
  if (monthKey !== steamNowMonth()) return rows;
  if (!currentTotalsMap || typeof currentTotalsMap !== "object") return rows;
  const currentMap = normalizeMinutesMap(currentTotalsMap);
  if (!Object.keys(currentMap).length) return rows;
  const nowMs = Date.now();
  const latest = rows[rows.length - 1];
  if (latest && sameMinutesMap(latest.totalsMin, currentMap)) return rows;
  if (latest && nowMs <= latest.capturedAtMs) {
    const latestDateKey = steamDateKeyFromUtcMs(latest.capturedAtMs);
    const todayKey = steamTodayKey();
    if (latestDateKey === todayKey) {
      const updated = rows.slice(0, -1);
      updated.push({
        ...latest,
        totalsMin: currentMap,
      });
      return updated;
    }
    return rows;
  }
  return [
    ...rows,
    {
      capturedAt: new Date(nowMs).toISOString(),
      capturedAtMs: nowMs,
      totalsMin: currentMap,
    },
  ];
}

function analyzeMonthSnapshots(snapshotSource, monthKey, currentTotalsMap = null) {
  const snapshots = withLiveSnapshot(snapshotSourceToArray(snapshotSource), monthKey, currentTotalsMap);
  const monthStart = steamMonthStartUtcMs(monthKey);
  const nextMonthStart = steamMonthStartUtcMs(shiftMonth(monthKey, 1));
  if (monthStart === null || nextMonthStart === null) {
    return { dayTotals: {}, dayEstimated: {}, monthTotals: {}, unknownTotals: {} };
  }

  const dayTotals = {};
  const dayEstimated = {};
  const monthTotals = {};
  const unknownTotals = {};

  for (let i = 1; i < snapshots.length; i += 1) {
    const prev = snapshots[i - 1];
    const curr = snapshots[i];
    if (!prev || !curr) continue;
    if (curr.capturedAtMs <= prev.capturedAtMs) continue;

    const intervalMs = curr.capturedAtMs - prev.capturedAtMs;
    const gapSeconds = intervalMs / 1000;
    const monthOverlapMs = overlapMs(prev.capturedAtMs, curr.capturedAtMs, monthStart, nextMonthStart);
    if (monthOverlapMs <= 0) continue;

    const deltaMap = buildPositiveDeltaMinutes(prev.totalsMin, curr.totalsMin);
    const largeGap = gapSeconds > STEAM_MAX_DISTRIBUTABLE_GAP_SECONDS;
    const estimatedGap = gapSeconds > STEAM_STRICT_GAP_SECONDS;

    for (const [appId, deltaMinutes] of Object.entries(deltaMap)) {
      if (deltaMinutes <= 0) continue;

      if (largeGap) {
        const monthShare = (deltaMinutes * monthOverlapMs) / intervalMs;
        if (monthShare <= 0) continue;
        monthTotals[appId] = (monthTotals[appId] || 0) + monthShare;
        unknownTotals[appId] = (unknownTotals[appId] || 0) + monthShare;
        continue;
      }

      const allocated = allocateMinutesByDay(prev.capturedAtMs, curr.capturedAtMs, deltaMinutes);
      for (const [dateKey, value] of Object.entries(allocated)) {
        if (!dateKey.startsWith(`${monthKey}-`)) continue;
        if (value <= 0) continue;
        const bucket = dayTotals[dateKey] || {};
        bucket[appId] = (bucket[appId] || 0) + value;
        dayTotals[dateKey] = bucket;
        monthTotals[appId] = (monthTotals[appId] || 0) + value;
        if (estimatedGap) {
          dayEstimated[dateKey] = true;
        }
      }
    }
  }

  return { dayTotals, dayEstimated, monthTotals, unknownTotals };
}

function buildTotalsMapFromGames(games) {
  const map = {};
  for (const game of games) {
    const appKey = String(game.appId || "");
    if (!appKey) continue;
    const fromMinutes = normalizeMinutes(game.playtimeMinutes);
    if (fromMinutes !== null) {
      map[appKey] = fromMinutes;
      continue;
    }
    const fromHours = hoursToMinutes(game.playtimeHours);
    map[appKey] = fromHours === null ? 0 : fromHours;
  }
  return map;
}

function computeMonthTotalsFromDaily(snapshotSource, monthKey, currentTotalsMap = null) {
  const { monthTotals } = analyzeMonthSnapshots(snapshotSource, monthKey, currentTotalsMap);
  return minutesMapToHoursMap(monthTotals);
}

function isMonthClosedInDaily(snapshotSource, monthKey) {
  const nextMonthFirstDay = `${shiftMonth(monthKey, 1)}-01`;
  const snapshots = normalizeSnapshots(snapshotSourceToArray(snapshotSource));
  return snapshots.some((snapshot) => steamDateKeyFromUtcMs(snapshot.capturedAtMs) >= nextMonthFirstDay);
}

function updateDailyTotalsStore(games, options = {}) {
  const dailyStore = loadSteamDailyTotals();
  const snapshotsBefore = normalizeSnapshots(dailyStore.snapshots);
  const beforeSerialized = JSON.stringify(snapshotsBefore.map((item) => [item.capturedAt, item.totalsMin]));
  const manualDate = String(options.dateKey || "").trim();
  const hasManualDate = /^\d{4}-\d{2}-\d{2}$/.test(manualDate);
  const dateKey = hasManualDate ? manualDate : steamTodayKey();
  const capturedAtMs = hasManualDate ? steamDayEndUtcMs(dateKey) : Date.now();
  const currentTotals = buildTotalsMapFromGames(games);

  let snapshots = snapshotsBefore;
  if (hasManualDate) {
    snapshots = snapshots.filter((snapshot) => steamDateKeyFromUtcMs(snapshot.capturedAtMs) !== dateKey);
  }

  const latest = snapshots[snapshots.length - 1];
  const latestDateKey = latest ? steamDateKeyFromUtcMs(latest.capturedAtMs) : "";
  const shouldAppend = !latest || !sameMinutesMap(latest.totalsMin, currentTotals) || latestDateKey !== dateKey || hasManualDate;

  if (shouldAppend && capturedAtMs !== null) {
    snapshots = normalizeSnapshots([
      ...snapshots,
      {
        capturedAt: new Date(capturedAtMs).toISOString(),
        totalsMin: currentTotals,
      },
    ]);
  }

  const afterSerialized = JSON.stringify(snapshots.map((item) => [item.capturedAt, item.totalsMin]));
  const changed = beforeSerialized !== afterSerialized;
  if (changed) {
    dailyStore.snapshots = snapshots;
    dailyStore.updatedAt = new Date().toISOString();
    saveSteamDailyTotals(dailyStore);
  }

  return {
    snapshots,
    updatedAt: dailyStore.updatedAt,
    changed,
    dateKey,
  };
}

function syncMonthlyArchiveFromDaily(monthlyHours, dailySnapshots, persist = false) {
  const currentMonth = steamNowMonth();
  const mergedMonthly = typeof monthlyHours === "object" && monthlyHours !== null ? monthlyHours : {};
  const dateKeys = listSnapshotDates(dailySnapshots);
  const monthCandidates = new Set();
  for (const dateKey of dateKeys) {
    monthCandidates.add(dateKey.slice(0, 7));
  }
  let monthlyChanged = false;

  const sortedMonths = Array.from(monthCandidates)
    .filter((monthKey) => /^\d{4}-\d{2}$/.test(monthKey))
    .sort((a, b) => a.localeCompare(b));

  for (const monthKey of sortedMonths) {
    if (monthKey >= currentMonth) continue;
    if (Object.prototype.hasOwnProperty.call(mergedMonthly, monthKey)) continue;
    if (!isMonthClosedInDaily(dailySnapshots, monthKey)) continue;
    mergedMonthly[monthKey] = computeMonthTotalsFromDaily(dailySnapshots, monthKey);
    monthlyChanged = true;
  }

  if (monthlyChanged && persist) {
    saveSteamMonthlyHours(mergedMonthly);
  }
  return mergedMonthly;
}

function loadSteamSources() {
  const dailyStore = loadSteamDailyTotals();
  const monthlyHours = syncMonthlyArchiveFromDaily(loadSteamMonthlyHours(), dailyStore.snapshots, false);
  return {
    monthlyHours,
    dailySnapshots: dailyStore.snapshots,
  };
}

function attachMonthHours(games, monthKey, sources = null, currentTotalsMap = null) {
  const monthlyPayload = sources && typeof sources.monthlyHours === "object" && sources.monthlyHours !== null ? sources.monthlyHours : loadSteamMonthlyHours();
  const monthBucket = typeof monthlyPayload[monthKey] === "object" && monthlyPayload[monthKey] !== null ? monthlyPayload[monthKey] : {};
  const snapshotSource = sources && Array.isArray(sources.dailySnapshots)
    ? sources.dailySnapshots
    : loadSteamDailyTotals().snapshots;
  const currentMonth = steamNowMonth();
  const monthBucketFromDaily = monthKey === currentMonth
    ? computeMonthTotalsFromDaily(snapshotSource, monthKey, currentTotalsMap)
    : computeMonthTotalsFromDaily(snapshotSource, monthKey, null);

  return games.map((game) => {
    const appKey = String(game.appId || "");
    const nameKey = game.name || "";
    let monthValue = null;

    if (Object.prototype.hasOwnProperty.call(monthBucket, appKey)) {
      monthValue = normalizeMonthHours(monthBucket[appKey]);
    } else if (Object.prototype.hasOwnProperty.call(monthBucket, nameKey)) {
      monthValue = normalizeMonthHours(monthBucket[nameKey]);
    }

    if (monthValue === null && Object.prototype.hasOwnProperty.call(monthBucketFromDaily, appKey)) {
      monthValue = normalizeMonthHours(monthBucketFromDaily[appKey]);
    }

    if (monthValue === null) {
      monthValue = 0;
    }

    return {
      ...game,
      monthHours: Math.round(monthValue * 10) / 10,
    };
  });
}

function withRatio(games, sortMode, selectedMonth, sources = null, currentTotalsMap = null) {
  const cards = attachMonthHours(games, selectedMonth, sources, currentTotalsMap);
  const totalHoursSum = cards.reduce((sum, item) => sum + Number(item.playtimeHours || 0), 0);
  const monthHoursSum = cards.reduce((sum, item) => sum + Number(item.monthHours || 0), 0);

  const rows = cards.map((item) => {
    const ratioTotal = totalHoursSum > 0 ? Math.round(((item.playtimeHours / totalHoursSum) * 100) * 100) / 100 : 0;
    const ratioMonth = monthHoursSum > 0 ? Math.round(((item.monthHours / monthHoursSum) * 100) * 100) / 100 : 0;
    return {
      ...item,
      ratioTotal,
      ratioMonth,
      ratio: sortMode === "month" ? ratioMonth : ratioTotal,
    };
  });

  const sortKey = sortMode === "month" ? "monthHours" : "playtimeHours";
  rows.sort((a, b) => Number(b[sortKey] || 0) - Number(a[sortKey] || 0));
  return rows;
}

async function fetchSteamOwnedCards(apiKey, steamId) {
  const endpoint = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("steamid", steamId);
  endpoint.searchParams.set("include_appinfo", "1");
  endpoint.searchParams.set("include_played_free_games", "1");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, { method: "GET" });
  if (!response.ok) {
    throw new Error("steam-response-not-ok");
  }

  const payload = await response.json();
  const gameList = payload?.response?.games || [];
  if (!Array.isArray(gameList) || gameList.length === 0) {
    return [];
  }

  return gameList.map((game) => {
    const appId = game.appid;
    const playtimeMinutes = normalizeMinutes(game.playtime_forever) || 0;
    const recentMinutes = normalizeMinutes(game.playtime_2weeks) || 0;
    return {
      appId,
      name: game.name || `App ${appId}`,
      playtimeMinutes,
      recentMinutes,
      playtimeHours: minutesToHours(playtimeMinutes) || 0,
      recentHours: minutesToHours(recentMinutes) || 0,
      coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
    };
  });
}

export async function fetchSteamGames(sortBy, monthKey) {
  const sortMode = sortBy === "total" ? "total" : "month";
  const apiKey = String(import.meta.env.STEAM_API_KEY || "").trim();
  const steamId = String(import.meta.env.STEAM_ID || "").trim();
  const archiveSources = loadSteamSources();

  if (!apiKey || !steamId) {
    return {
      games: withRatio(FALLBACK_STEAM_GAMES, sortMode, monthKey, archiveSources, buildTotalsMapFromGames(FALLBACK_STEAM_GAMES)),
      notice: "当前显示示例数据。配置 STEAM_API_KEY 和 STEAM_ID 后将自动切换为 Steam 实时数据。",
    };
  }

  const nowTs = Date.now();
  const cacheKey = steamId;
  const cachedEntry = steamOwnedGamesCache.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > nowTs && Array.isArray(cachedEntry.cards) && cachedEntry.cards.length > 0) {
    const currentTotalsMap = buildTotalsMapFromGames(cachedEntry.cards);
    return {
      games: withRatio(cachedEntry.cards, sortMode, monthKey, archiveSources, currentTotalsMap),
      notice: "已加载 Steam 缓存数据。",
    };
  }

  try {
    const cards = await fetchSteamOwnedCards(apiKey, steamId);
    if (!cards.length) {
      return { games: [], notice: "未从 Steam API 获取到游戏数据。" };
    }

    steamOwnedGamesCache.set(cacheKey, {
      cards,
      expiresAt: Date.now() + STEAM_CACHE_TTL_MS,
    });
    const currentTotalsMap = buildTotalsMapFromGames(cards);

    return {
      games: withRatio(cards, sortMode, monthKey, archiveSources, currentTotalsMap),
      notice: "已加载 Steam API 实时数据。",
    };
  } catch {
    if (cachedEntry && Array.isArray(cachedEntry.cards) && cachedEntry.cards.length > 0) {
      const currentTotalsMap = buildTotalsMapFromGames(cachedEntry.cards);
      return {
        games: withRatio(cachedEntry.cards, sortMode, monthKey, archiveSources, currentTotalsMap),
        notice: "Steam API 调用失败，当前显示最近缓存数据。",
      };
    }
    return {
      games: withRatio(FALLBACK_STEAM_GAMES, sortMode, monthKey, archiveSources, buildTotalsMapFromGames(FALLBACK_STEAM_GAMES)),
      notice: "Steam API 调用失败，当前显示示例数据。",
    };
  }
}

export async function syncSteamSnapshots(options = {}) {
  const apiKey = String(options.apiKey || import.meta.env.STEAM_API_KEY || "").trim();
  const steamId = String(options.steamId || import.meta.env.STEAM_ID || "").trim();
  const dateKey = String(options.dateKey || "").trim();

  if (!apiKey || !steamId) {
    throw new Error("STEAM_API_KEY and STEAM_ID are required");
  }

  const cards = await fetchSteamOwnedCards(apiKey, steamId);
  if (!cards.length) {
    return {
      ok: false,
      reason: "empty-games",
      updatedDaily: false,
      updatedMonthly: false,
      games: 0,
      dateKey: "",
      archivedMonths: [],
    };
  }

  const monthlyBefore = loadSteamMonthlyHours();
  const monthlyBeforeSnapshot = JSON.stringify(monthlyBefore);
  const monthlyBeforeKeys = Object.keys(monthlyBefore);
  const dailyStore = updateDailyTotalsStore(cards, { dateKey });
  const monthlyAfter = syncMonthlyArchiveFromDaily(monthlyBefore, dailyStore.snapshots, false);
  const updatedMonthly = monthlyBeforeSnapshot !== JSON.stringify(monthlyAfter);

  if (updatedMonthly) {
    saveSteamMonthlyHours(monthlyAfter);
  }

  const archivedMonths = Object.keys(monthlyAfter).filter((monthKey) => !monthlyBeforeKeys.includes(monthKey));

  return {
    ok: true,
    updatedDaily: dailyStore.changed,
    updatedMonthly,
    games: cards.length,
    dateKey: dailyStore.dateKey,
    archivedMonths,
  };
}

export function buildDailyGameChart(monthKey, allGames, dailySnapshots = null) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const isCurrentMonth = monthKey === steamNowMonth();
  const todayParsed = parseDateKey(steamTodayKey());
  const currentDay = todayParsed ? Math.max(1, todayParsed.day) : 1;
  const chartLength = isCurrentMonth ? Math.min(daysInMonth, currentDay) : daysInMonth;
  const snapshotSource = dailySnapshots !== null ? dailySnapshots : loadSteamDailyTotals().snapshots;
  const gameList = Array.isArray(allGames) ? allGames : [];
  const currentTotalsMap = buildTotalsMapFromGames(gameList);
  const gameMetaByAppId = new Map(
    gameList.map((item) => [String(item.appId || ""), { name: item.name || "", coverUrl: item.coverUrl || "" }])
  );

  const analysis = analyzeMonthSnapshots(snapshotSource, monthKey, currentTotalsMap);
  const dayDiffByDate = analysis.dayTotals;

  const rows = [];
  for (let day = 1; day <= chartLength; day += 1) {
    const dateKey = `${monthKey}-${pad2(day)}`;
    const diffMap = dayDiffByDate[dateKey] && typeof dayDiffByDate[dateKey] === "object" ? dayDiffByDate[dateKey] : {};
    let totalMinutes = 0;
    let maxMinutes = 0;
    let maxAppId = "";

    for (const [appId, value] of Object.entries(diffMap)) {
      const minutes = Number(value || 0);
      if (minutes <= 0) continue;
      totalMinutes += minutes;
      if (minutes > maxMinutes) {
        maxMinutes = minutes;
        maxAppId = appId;
      }
    }

    const meta = gameMetaByAppId.get(maxAppId) || { name: "", coverUrl: "" };
    rows.push({
      day,
      totalHours: minutesToHours(totalMinutes) || 0,
      maxHours: minutesToHours(maxMinutes) || 0,
      maxCoverUrl: meta.coverUrl || "",
      maxGameName: meta.name || "",
    });
  }

  const maxTotal = Math.max(0, ...rows.map((row) => Number(row.totalHours || 0)));
  return rows.map((row) => {
    return {
      ...row,
      totalHeight: maxTotal > 0 ? Math.round(((row.totalHours / maxTotal) * 100) * 100) / 100 : 0,
      maxHeight: maxTotal > 0 ? Math.round(((row.maxHours / maxTotal) * 100) * 100) / 100 : 0,
    };
  });
}

export function mergeGameFreeChartRows(chartRows) {
  const merged = [];
  let i = 0;
  const colWidth = 8;
  const colGap = 2;

  while (i < chartRows.length) {
    const row = chartRows[i];
    if (Number(row.totalHours || 0) > 0) {
      merged.push({ kind: "day", ...row });
      i += 1;
      continue;
    }

    let j = i;
    while (j < chartRows.length && Number(chartRows[j].totalHours || 0) <= 0) {
      j += 1;
    }
    const span = j - i;

    if (span >= 3) {
      const widthPx = Math.max(72, span * colWidth + (span - 1) * colGap);
      merged.push({
        kind: "game_free",
        span,
        widthPx,
        startDay: chartRows[i].day,
        endDay: chartRows[j - 1].day,
      });
    } else {
      for (let k = i; k < j; k += 1) {
        merged.push({ kind: "day", ...chartRows[k] });
      }
    }
    i = j;
  }

  return merged;
}

export async function buildDashboardData(monthParam, dayParam) {
  const { minMonth, maxMonth } = getMonthBounds();
  const allArticles = loadArticles("desc");
  const allBooks = loadBooks("desc");
  const selectedMonth = resolveMonth(monthParam, minMonth, maxMonth);
  const steamSources = loadSteamSources();
  const steamResult = await fetchSteamGames("month", selectedMonth);

  const monthArticles = allArticles.filter((item) => item.date.startsWith(selectedMonth));
  const monthBooks = allBooks.filter((item) => item.monthRaw === selectedMonth);
  const monthGames = steamResult.games.filter((item) => Number(item.monthHours || 0) > 0);

  let selectedDay = dayParam || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(selectedDay) || !selectedDay.startsWith(selectedMonth)) {
    selectedDay = "";
  }

  const calendarWeeks = buildArticleCalendar(selectedMonth, monthArticles);
  const calendarArticles = selectedDay ? monthArticles.filter((item) => item.date === selectedDay) : monthArticles;

  const dailyGameChart = buildDailyGameChart(selectedMonth, steamResult.games, steamSources.dailySnapshots);
  const dailyGameChartDisplay = mergeGameFreeChartRows(dailyGameChart);

  const axisMaxValue = Math.max(0, ...dailyGameChart.map((row) => Number(row.totalHours || 0)));
  const axisMax = Math.round(axisMaxValue * 10) / 10;
  const axisMid = axisMax > 0 ? Math.round((axisMax / 2) * 10) / 10 : 0;

  const monthGameHours = Math.round(monthGames.reduce((sum, item) => sum + Number(item.monthHours || 0), 0) * 10) / 10;
  const totalGameHours = Math.round(steamResult.games.reduce((sum, item) => sum + Number(item.playtimeHours || 0), 0) * 10) / 10;

  const tagCounter = new Map();
  for (const article of monthArticles) {
    const tags = article.tags.length > 0 ? article.tags : ["未分类"];
    for (const tag of tags) {
      tagCounter.set(tag, (tagCounter.get(tag) || 0) + 1);
    }
  }

  const tagRank = addRatio(
    Array.from(tagCounter.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name, value]) => ({ name, value })),
    "value"
  );

  const gameRank = addRatio(
    monthGames.slice(0, 8).map((item) => ({ name: item.name, value: item.monthHours })),
    "value"
  );

  return {
    monthMin: minMonth,
    monthMax: maxMonth,
    monthLabel: formatMonthLabel(selectedMonth),
    monthButtonLabel: formatMonthCompact(selectedMonth),
    monthOptions: buildMonthRangeOptions(minMonth, maxMonth),
    selectedMonth,
    selectedDay,
    selectedDayLabel: selectedDay || `${formatMonthLabel(selectedMonth)} 全部文章`,
    calendarWeeks,
    calendarArticles,
    dailyGameChart,
    dailyGameChartDisplay,
    monthlyArticles: monthArticles,
    monthlyBooks: monthBooks,
    monthlyGames: monthGames,
    statTotalArticles: allArticles.length,
    statTotalBooks: allBooks.length,
    statMonthArticles: monthArticles.length,
    statMonthBooks: monthBooks.length,
    statTotalGameHours: totalGameHours,
    statMonthGameHours: monthGameHours,
    statActiveGames: monthGames.filter((item) => Number(item.monthHours || 0) >= 30).length,
    dailyAxisMax: axisMax,
    dailyAxisMid: axisMid,
    tagRank,
    gameRank,
  };
}

export function escapeHtml(input) {
  return String(input || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderDayArticlePanel(selectedDayLabel, calendarArticles) {
  const titleHtml = `<h4>${escapeHtml(selectedDayLabel)}</h4>`;
  if (!calendarArticles.length) {
    return `${titleHtml}<div class="day-article-grid"><p class="meta">No articles on this date.</p></div>`;
  }

  const cards = calendarArticles
    .map((article) => {
      const slug = encodeURIComponent(article.slug);
      return `<a href="/articles/${slug}/" class="card card-link day-article-card"><div class="day-article-thumb"><img src="${escapeHtml(article.cover)}" alt="${escapeHtml(article.title)} cover" loading="lazy" decoding="async" fetchpriority="low"></div><div class="day-article-content"><h3>${escapeHtml(article.title)}</h3></div></a>`;
    })
    .join("");

  return `${titleHtml}<div class="day-article-grid">${cards}</div>`;
}




