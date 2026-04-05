import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DAILY_FILE = resolve(process.cwd(), "content", "steam", "daily_totals.json");
const MONTHLY_FILE = resolve(process.cwd(), "content", "steam", "monthly_hours.json");
const ENV_FILE = resolve(process.cwd(), ".env");

function parseArgs(argv) {
  const result = { date: "" };
  for (let i = 2; i < argv.length; i += 1) {
    if (argv[i] === "--date") {
      result.date = String(argv[i + 1] || "").trim();
      i += 1;
    }
  }
  return result;
}

function formatLocalDate(dateObj) {
  const year = dateObj.getFullYear();
  const month = String(dateObj.getMonth() + 1).padStart(2, "0");
  const day = String(dateObj.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftMonth(monthKey, step) {
  const match = String(monthKey || "").match(/^(\d{4})-(\d{2})$/);
  if (!match) return monthKey;
  const base = new Date(Number(match[1]), Number(match[2]) - 1 + Number(step || 0), 1);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}`;
}

function normalizeHour(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(n, 0) * 10) / 10;
}

function normalizeHoursMap(map) {
  const source = typeof map === "object" && map !== null ? map : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = normalizeHour(value);
    if (normalized !== null) result[String(key)] = normalized;
  }
  return result;
}

function buildDiffMap(startTotals, endTotals) {
  const start = normalizeHoursMap(startTotals);
  const end = normalizeHoursMap(endTotals);
  const result = {};
  const keys = new Set([...Object.keys(start), ...Object.keys(end)]);
  for (const key of keys) {
    const diff = normalizeHour(Math.max(0, Number(end[key] || 0) - Number(start[key] || 0)));
    if (diff && diff > 0) result[key] = diff;
  }
  return result;
}

function mergeHoursMap(target, source) {
  const src = normalizeHoursMap(source);
  for (const [key, value] of Object.entries(src)) {
    const next = normalizeHour(Number(target[key] || 0) + value);
    if (next && next > 0) target[key] = next;
  }
}

function listSnapshotDates(days) {
  return Object.keys(days || {})
    .filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key))
    .sort((a, b) => a.localeCompare(b));
}

function computeMonthTotalsFromDaily(days, monthKey) {
  const dates = listSnapshotDates(days);
  const result = {};
  for (let i = 1; i < dates.length; i += 1) {
    const currentDate = dates[i];
    if (!currentDate.startsWith(`${monthKey}-`)) continue;
    const prevDate = dates[i - 1];
    const diff = buildDiffMap(days[prevDate], days[currentDate]);
    mergeHoursMap(result, diff);
  }
  return result;
}

function isMonthClosedInDaily(days, monthKey) {
  const nextMonth = shiftMonth(monthKey, 1);
  const nextMonthFirstDay = `${nextMonth}-01`;
  const dates = listSnapshotDates(days);
  return dates.some((dateKey) => dateKey >= nextMonthFirstDay);
}

function readJson(filePath, fallback) {
  try {
    const parsed = JSON.parse(readFileSync(filePath, "utf8"));
    return typeof parsed === "object" && parsed !== null ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function loadDotEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const raw = readFileSync(filePath, "utf8");
  const lines = String(raw || "").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    const name = key.trim();
    if (!name || Object.prototype.hasOwnProperty.call(process.env, name)) continue;
    const value = rest.join("=").trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    process.env[name] = value;
  }
}

async function fetchSteamOwnedGames(apiKey, steamId) {
  const endpoint = new URL("https://api.steampowered.com/IPlayerService/GetOwnedGames/v0001/");
  endpoint.searchParams.set("key", apiKey);
  endpoint.searchParams.set("steamid", steamId);
  endpoint.searchParams.set("include_appinfo", "1");
  endpoint.searchParams.set("include_played_free_games", "1");
  endpoint.searchParams.set("format", "json");

  const response = await fetch(endpoint, { method: "GET" });
  if (!response.ok) {
    throw new Error(`Steam API request failed: ${response.status}`);
  }

  const payload = await response.json();
  const games = Array.isArray(payload?.response?.games) ? payload.response.games : [];
  return games.map((game) => ({
    appId: String(game.appid || ""),
    hours: normalizeHour((Number(game.playtime_forever || 0) / 60)) || 0,
  }));
}

function buildTotalsMapFromGames(games) {
  const result = {};
  for (const game of games) {
    if (!game.appId) continue;
    result[game.appId] = normalizeHour(game.hours) || 0;
  }
  return result;
}

const args = parseArgs(process.argv);
loadDotEnvFile(ENV_FILE);
const apiKey = String(process.env.STEAM_API_KEY || "").trim();
const steamId = String(process.env.STEAM_ID || "").trim();

if (!apiKey || !steamId) {
  console.error("Missing STEAM_API_KEY or STEAM_ID.");
  process.exit(1);
}

if (args.date && !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
  console.error("Invalid --date value, expected YYYY-MM-DD.");
  process.exit(1);
}

try {
  const games = await fetchSteamOwnedGames(apiKey, steamId);
  const totalsMap = buildTotalsMapFromGames(games);
  const dailyStore = readJson(DAILY_FILE, { days: {}, updatedAt: "" });
  const days = typeof dailyStore.days === "object" && dailyStore.days !== null ? dailyStore.days : {};
  const targetDate = args.date || formatLocalDate(new Date());

  const beforeDaily = JSON.stringify(normalizeHoursMap(days[targetDate]));
  days[targetDate] = totalsMap;
  const afterDaily = JSON.stringify(normalizeHoursMap(days[targetDate]));
  const updatedDaily = beforeDaily !== afterDaily;

  const nextDailyStore = {
    days,
    updatedAt: new Date().toISOString(),
  };
  writeJson(DAILY_FILE, nextDailyStore);

  const monthlyStore = readJson(MONTHLY_FILE, {});
  const monthlyBefore = JSON.stringify(monthlyStore);
  const currentMonth = formatLocalDate(new Date()).slice(0, 7);
  const candidates = Array.from(new Set(listSnapshotDates(days).map((key) => key.slice(0, 7))))
    .filter((monthKey) => /^\d{4}-\d{2}$/.test(monthKey))
    .sort((a, b) => a.localeCompare(b));

  const archivedMonths = [];
  for (const monthKey of candidates) {
    if (monthKey >= currentMonth) continue;
    if (Object.prototype.hasOwnProperty.call(monthlyStore, monthKey)) continue;
    if (!isMonthClosedInDaily(days, monthKey)) continue;
    monthlyStore[monthKey] = computeMonthTotalsFromDaily(days, monthKey);
    archivedMonths.push(monthKey);
  }

  const updatedMonthly = monthlyBefore !== JSON.stringify(monthlyStore);
  if (updatedMonthly) {
    writeJson(MONTHLY_FILE, monthlyStore);
  }

  console.log(`[steam] snapshot date: ${targetDate}`);
  console.log(`[steam] games: ${games.length}`);
  console.log(`[steam] daily updated: ${updatedDaily ? "yes" : "no"}`);
  console.log(`[steam] monthly updated: ${updatedMonthly ? "yes" : "no"}`);
  if (archivedMonths.length > 0) {
    console.log(`[steam] archived months: ${archivedMonths.join(", ")}`);
  }
} catch (error) {
  console.error("[steam] snapshot sync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
