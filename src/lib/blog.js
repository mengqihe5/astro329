import { fileURLToPath } from "node:url";
import { statSync } from "node:fs";

export const SITE_PROFILE = {
  nickname: "Micah Hale",
  avatarText: "M",
};

export const NAV_ITEMS = [
  { title: "首页", href: "/", icon: "home", activePrefixes: ["/"] },
  { title: "文章", href: "/articles/", icon: "article", activePrefixes: ["/articles"] },
  { title: "游戏记录", href: "/steam/", icon: "gamepad", activePrefixes: ["/steam"] },
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

const DEFAULT_STEAM_ID = "76561199562793160";
const DEFAULT_STEAM_API_KEY = "";
export const BLOG_START_MONTH = "2026-03";
const STEAM_CACHE_TTL_MS = 5 * 60 * 1000;
const steamOwnedGamesCache = new Map();

const ARTICLE_COVER_BY_SLUG = {
  "django-blog-day-1": "/app01/article-covers/cover-django.svg",
  "reading-notes-2026-03": "/app01/article-covers/cover-reading.svg",
  "steam-log-method": "/app01/article-covers/cover-steam.svg",
};
const DEFAULT_ARTICLE_COVER = "/app01/article-covers/cover-default.svg";

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
const BOOK_COVER_FILES = import.meta.glob("../../app01/static/app01/book-covers/*", {
  eager: true,
  import: "default",
});
const STEAM_MONTHLY_JSON = import.meta.glob("../../content/steam/monthly_hours.json", {
  eager: true,
  query: "?raw",
  import: "default",
});

const BOOK_COVER_NAMES = new Set(
  Object.keys(BOOK_COVER_FILES).map((pathName) => {
    const match = pathName.match(/([^/\\]+)$/);
    return match ? match[1] : "";
  })
);

function nowMonth() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
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

  const body = lines.slice(bodyStartIndex).join("\n").trim();
  return { metadata, body };
}

function parseTags(rawTags) {
  if (!rawTags) return [];
  return String(rawTags)
    .split(/[，,]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
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

function findBookCover(slug) {
  for (const ext of BOOK_COVER_EXTENSIONS) {
    const fileName = `${slug}${ext}`;
    if (BOOK_COVER_NAMES.has(fileName)) {
      return `/app01/book-covers/${fileName}`;
    }
  }
  return "/app01/book-covers/default-book.svg";
}

function buildSummary(metadata, body) {
  if (metadata.summary) return metadata.summary;
  const compact = body.split(/\s+/).join(" ");
  return compact.length > 90 ? `${compact.slice(0, 90)}...` : compact;
}

export function loadArticles(order = "desc") {
  const rows = Object.entries(ARTICLE_FILES).map(([pathName, rawText]) => {
    const slug = slugFromPath(pathName);
    const { metadata, body } = parseFrontMatter(String(rawText || ""));
    return {
      slug,
      title: metadata.title || slug.replace(/-/g, " "),
      date: metadata.date || "1970-01-01",
      summary: buildSummary(metadata, body),
      content: body,
      tags: parseTags(metadata.tags),
      cover: ARTICLE_COVER_BY_SLUG[slug] || DEFAULT_ARTICLE_COVER,
      mtime: getMtime(pathName),
    };
  });

  const reverse = order !== "asc";
  rows.sort((a, b) => {
    const dateDelta = a.date.localeCompare(b.date);
    if (dateDelta !== 0) return reverse ? -dateDelta : dateDelta;
    return reverse ? b.mtime - a.mtime : a.mtime - b.mtime;
  });
  return rows;
}

export function loadBooks(order = "desc") {
  const rows = [];
  for (const [pathName, rawText] of Object.entries(REVIEW_FILES)) {
    const slug = slugFromPath(pathName);
    if (slug.toLowerCase() === "readme") continue;
    const { metadata, body } = parseFrontMatter(String(rawText || ""));
    const monthRaw = metadata.month || "未知月份";
    const parsedTags = parseTags(metadata.tags);
    rows.push({
      slug,
      title: metadata.title || slug.replace(/-/g, " "),
      monthRaw,
      monthLabel: formatMonthLabel(monthRaw),
      cover: findBookCover(slug),
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

function loadSteamMonthlyHours() {
  const raw = Object.values(STEAM_MONTHLY_JSON)[0];
  if (!raw) return {};
  try {
    const parsed = JSON.parse(String(raw));
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

function normalizeMonthHours(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.round(Math.max(number, 0) * 10) / 10;
}

function attachMonthHours(games, monthKey) {
  const monthlyPayload = loadSteamMonthlyHours();
  const monthBucket = typeof monthlyPayload[monthKey] === "object" && monthlyPayload[monthKey] !== null ? monthlyPayload[monthKey] : {};

  return games.map((game) => {
    const appKey = String(game.appId || "");
    const nameKey = game.name || "";
    let monthValue = null;

    if (Object.prototype.hasOwnProperty.call(monthBucket, appKey)) {
      monthValue = normalizeMonthHours(monthBucket[appKey]);
    } else if (Object.prototype.hasOwnProperty.call(monthBucket, nameKey)) {
      monthValue = normalizeMonthHours(monthBucket[nameKey]);
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

function withRatio(games, sortMode, selectedMonth) {
  const cards = attachMonthHours(games, selectedMonth);
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

export async function fetchSteamGames(sortBy, monthKey) {
  const sortMode = sortBy === "total" ? "total" : "month";
  const apiKey = String(import.meta.env.STEAM_API_KEY || DEFAULT_STEAM_API_KEY || "").trim();
  const steamId = String(import.meta.env.STEAM_ID || DEFAULT_STEAM_ID || "").trim();

  if (!apiKey || !steamId) {
    return {
      games: withRatio(FALLBACK_STEAM_GAMES, sortMode, monthKey),
      notice: "当前显示示例数据。配置 STEAM_API_KEY 和 STEAM_ID 后将自动切换为 Steam 实时数据。",
    };
  }

  const nowTs = Date.now();
  const cacheKey = steamId;
  const cachedEntry = steamOwnedGamesCache.get(cacheKey);
  if (cachedEntry && cachedEntry.expiresAt > nowTs && Array.isArray(cachedEntry.cards) && cachedEntry.cards.length > 0) {
    return {
      games: withRatio(cachedEntry.cards, sortMode, monthKey),
      notice: "已加载 Steam 缓存数据。",
    };
  }

  const endpoint = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("steamid", steamId);
  endpoint.searchParams.set("include_appinfo", "1");
  endpoint.searchParams.set("include_played_free_games", "1");
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetch(endpoint, { method: "GET" });
    if (!response.ok) {
      throw new Error("steam-response-not-ok");
    }
    const payload = await response.json();
    const gameList = payload?.response?.games || [];
    if (!Array.isArray(gameList) || gameList.length === 0) {
      return { games: [], notice: "未从 Steam API 获取到游戏数据。" };
    }

    const cards = gameList.map((game) => {
      const appId = game.appid;
      return {
        appId,
        name: game.name || `App ${appId}`,
        playtimeHours: Math.round(((game.playtime_forever || 0) / 60) * 10) / 10,
        recentHours: Math.round(((game.playtime_2weeks || 0) / 60) * 10) / 10,
        coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`,
      };
    });

    steamOwnedGamesCache.set(cacheKey, {
      cards,
      expiresAt: Date.now() + STEAM_CACHE_TTL_MS,
    });

    return {
      games: withRatio(cards, sortMode, monthKey),
      notice: "已加载 Steam API 实时数据。",
    };
  } catch {
    if (cachedEntry && Array.isArray(cachedEntry.cards) && cachedEntry.cards.length > 0) {
      return {
        games: withRatio(cachedEntry.cards, sortMode, monthKey),
        notice: "Steam API 调用失败，当前显示最近缓存数据。",
      };
    }
    return {
      games: withRatio(FALLBACK_STEAM_GAMES, sortMode, monthKey),
      notice: "Steam API 调用失败，当前显示示例数据。",
    };
  }
}

export function buildDailyGameChart(monthKey, monthGames) {
  const [year, month] = monthKey.split("-").map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  const totalByDay = Array.from({ length: daysInMonth }, () => 0);
  const maxByDay = Array.from({ length: daysInMonth }, () => 0);
  const maxCoverByDay = Array.from({ length: daysInMonth }, () => "");
  const maxNameByDay = Array.from({ length: daysInMonth }, () => "");

  if (monthGames.length > 0) {
    const activeDays = Array.from({ length: daysInMonth }, (_, i) => i);

    monthGames.forEach((game, gameIndex) => {
      const monthlyHours = Number(game.monthHours || 0);
      if (monthlyHours <= 0) return;

      const weights = activeDays.map((dayIndex) => {
        const wave = ((gameIndex + 3) * (dayIndex + 5)) % 7;
        return 1 + wave / 7;
      });
      const weightSum = weights.reduce((sum, value) => sum + value, 0);
      if (weightSum <= 0) return;

      activeDays.forEach((dayIndex, i) => {
        const value = monthlyHours * (weights[i] / weightSum);
        totalByDay[dayIndex] += value;
        if (value > maxByDay[dayIndex]) {
          maxByDay[dayIndex] = value;
          maxCoverByDay[dayIndex] = game.coverUrl || "";
          maxNameByDay[dayIndex] = game.name || "";
        }
      });
    });
  }

  const maxTotal = Math.max(0, ...totalByDay);
  return totalByDay.map((totalValue, idx) => {
    const totalHours = Math.round(totalValue * 10) / 10;
    const maxHours = Math.round(maxByDay[idx] * 10) / 10;
    return {
      day: idx + 1,
      totalHours,
      maxHours,
      totalHeight: maxTotal > 0 ? Math.round(((totalHours / maxTotal) * 100) * 100) / 100 : 0,
      maxHeight: maxTotal > 0 ? Math.round(((maxHours / maxTotal) * 100) * 100) / 100 : 0,
      maxCoverUrl: maxCoverByDay[idx],
      maxGameName: maxNameByDay[idx],
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
      const widthPx = Math.max(18, span * colWidth + (span - 1) * colGap);
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

  const dailyGameChart = buildDailyGameChart(selectedMonth, monthGames);
  const dailyGameChartDisplay = mergeGameFreeChartRows(dailyGameChart);

  const axisMaxValue = Math.max(0, ...dailyGameChart.map((row) => Number(row.totalHours || 0)));
  const axisMax = Math.round(axisMaxValue * 10) / 10;
  const axisMid = axisMax > 0 ? Math.round((axisMax / 2) * 10) / 10 : 0;

  const monthGameHours = Math.round(monthGames.reduce((sum, item) => sum + Number(item.monthHours || 0), 0) * 10) / 10;

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




