import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DAILY_FILE = resolve(process.cwd(), "content", "steam", "daily_totals.json");
const MONTHLY_FILE = resolve(process.cwd(), "content", "steam", "monthly_hours.json");
const ENV_FILE = resolve(process.cwd(), ".env");

const STEAM_TIME_ZONE = "Asia/Hong_Kong";
const STEAM_ZONE_OFFSET_MS = 8 * 60 * 60 * 1000;
const STEAM_DAY_MS = 24 * 60 * 60 * 1000;

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

function pad2(value) {
  return String(value).padStart(2, "0");
}

function steamDateKeyFromUtcMs(utcMs) {
  const shifted = new Date(Number(utcMs) + STEAM_ZONE_OFFSET_MS);
  return `${shifted.getUTCFullYear()}-${pad2(shifted.getUTCMonth() + 1)}-${pad2(shifted.getUTCDate())}`;
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
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
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

function normalizeMinutes(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.round(n));
}

function normalizeMinutesMap(map) {
  const source = typeof map === "object" && map !== null ? map : {};
  const result = {};
  for (const [key, value] of Object.entries(source)) {
    const normalized = normalizeMinutes(value);
    if (normalized !== null) result[String(key)] = normalized;
  }
  return result;
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
    if (value && value > 0) result[String(key)] = value;
  }
  return result;
}

function normalizeSnapshot(rawSnapshot) {
  if (!rawSnapshot || typeof rawSnapshot !== "object") return null;
  const capturedAt = String(rawSnapshot.capturedAt || "").trim();
  const capturedAtMs = Date.parse(capturedAt);
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
      if (minutes !== null) fromHours[String(key)] = minutes;
    }
    totalsMin = fromHours;
  }
  return {
    capturedAt: new Date(capturedAtMs).toISOString(),
    capturedAtMs,
    totalsMin,
  };
}

function normalizeSnapshots(input, options = {}) {
  const source = Array.isArray(input) ? input : [];
  const result = [];
  for (const row of source) {
    const snapshot = normalizeSnapshot(row);
    if (snapshot) result.push(snapshot);
  }
  result.sort((a, b) => a.capturedAtMs - b.capturedAtMs);

  const deduped = [];
  for (const row of result) {
    const prev = deduped[deduped.length - 1];
    if (prev && prev.capturedAt === row.capturedAt) {
      deduped[deduped.length - 1] = row;
      continue;
    }
    deduped.push(row);
  }

  if (options.monotonic === false) {
    return deduped;
  }

  const monotonic = [];
  let runningTotals = {};
  for (const row of deduped) {
    const current = normalizeMinutesMap(row.totalsMin);
    const merged = { ...runningTotals };
    for (const [key, value] of Object.entries(current)) {
      const previous = Number(runningTotals[key] || 0);
      merged[key] = value > previous ? value : previous;
    }
    runningTotals = merged;
    monotonic.push({
      ...row,
      totalsMin: merged,
    });
  }
  return monotonic;
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
    for (const [key, value] of Object.entries(normalizedHours)) {
      const minutes = hoursToMinutes(value);
      if (minutes !== null) totalsMin[String(key)] = minutes;
    }
    snapshots.push({
      capturedAt: new Date(capturedAtMs).toISOString(),
      capturedAtMs,
      totalsMin,
    });
  }
  return normalizeSnapshots(snapshots, { monotonic: false });
}

function loadDailySnapshots(payload) {
  const snapshots = normalizeSnapshots(payload?.snapshots, { monotonic: false });
  if (snapshots.length > 0) return snapshots;
  return legacyDaysToSnapshots(payload?.days);
}

function serializeSnapshotsForCompare(snapshots) {
  return JSON.stringify(
    normalizeSnapshots(snapshots, { monotonic: false }).map((snapshot) => [snapshot.capturedAt, normalizeMinutesMap(snapshot.totalsMin)])
  );
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

function listSnapshotDates(snapshots) {
  const dates = new Set();
  for (const snapshot of normalizeSnapshots(snapshots, { monotonic: false })) {
    dates.add(steamDateKeyFromUtcMs(snapshot.capturedAtMs));
  }
  return Array.from(dates).sort((a, b) => a.localeCompare(b));
}

function isMonthClosedInSnapshots(snapshots, monthKey) {
  const nextMonthFirstDay = `${shiftMonth(monthKey, 1)}-01`;
  return normalizeSnapshots(snapshots).some((snapshot) => steamDateKeyFromUtcMs(snapshot.capturedAtMs) >= nextMonthFirstDay);
}

function buildPositiveDeltaMinutes(startTotals, endTotals) {
  const start = normalizeMinutesMap(startTotals);
  const end = normalizeMinutesMap(endTotals);
  const result = {};
  const keys = new Set([...Object.keys(start), ...Object.keys(end)]);
  for (const key of keys) {
    const diff = Number(end[key] || 0) - Number(start[key] || 0);
    if (diff > 0) result[key] = diff;
  }
  return result;
}

function overlapMs(startA, endA, startB, endB) {
  const start = Math.max(startA, startB);
  const end = Math.min(endA, endB);
  return Math.max(0, end - start);
}

function collapseSnapshotsByDay(snapshots) {
  const rows = Array.isArray(snapshots) ? snapshots : [];
  const latestByDay = new Map();
  for (const snapshot of rows) {
    const dayKey = steamDateKeyFromUtcMs(snapshot.capturedAtMs);
    const previous = latestByDay.get(dayKey);
    if (!previous || snapshot.capturedAtMs >= previous.capturedAtMs) {
      latestByDay.set(dayKey, snapshot);
    }
  }
  return Array.from(latestByDay.values()).sort((a, b) => a.capturedAtMs - b.capturedAtMs);
}

function buildStableDeltaMinutes(prevSnapshot, currSnapshot, nextSnapshot = null) {
  const prevMap = prevSnapshot && typeof prevSnapshot.totalsMin === "object" ? prevSnapshot.totalsMin : {};
  const currMap = currSnapshot && typeof currSnapshot.totalsMin === "object" ? currSnapshot.totalsMin : {};
  const nextMap = nextSnapshot && typeof nextSnapshot.totalsMin === "object" ? nextSnapshot.totalsMin : null;
  const keys = new Set([...Object.keys(prevMap), ...Object.keys(currMap), ...(nextMap ? Object.keys(nextMap) : [])]);
  const result = {};

  for (const key of keys) {
    const start = Number(prevMap[key] || 0);
    const current = Number(currMap[key] || 0);
    let delta = current - start;
    if (delta <= 0) continue;

    if (nextMap) {
      const nextValue = Number(nextMap[key] || 0);
      if (nextValue < current) {
        delta = Math.max(0, nextValue - start);
      }
    }

    if (delta > 0) {
      result[key] = delta;
    }
  }

  return result;
}

function computeMonthTotalsFromSnapshots(snapshots, monthKey) {
  const rows = collapseSnapshotsByDay(normalizeSnapshots(snapshots, { monotonic: false }));
  const monthStart = steamMonthStartUtcMs(monthKey);
  const nextMonthStart = steamMonthStartUtcMs(shiftMonth(monthKey, 1));
  if (monthStart === null || nextMonthStart === null) return {};

  const minutesTotals = {};
  for (let i = 1; i < rows.length; i += 1) {
    const prev = rows[i - 1];
    const curr = rows[i];
    const next = rows[i + 1] || null;
    if (!prev || !curr) continue;
    if (curr.capturedAtMs <= prev.capturedAtMs) continue;
    const intervalMs = curr.capturedAtMs - prev.capturedAtMs;
    const monthOverlap = overlapMs(prev.capturedAtMs, curr.capturedAtMs, monthStart, nextMonthStart);
    if (monthOverlap <= 0) continue;

    const deltaMap = buildStableDeltaMinutes(prev, curr, next);
    for (const [appId, deltaMinutes] of Object.entries(deltaMap)) {
      const monthShare = (deltaMinutes * monthOverlap) / intervalMs;
      if (monthShare > 0) {
        minutesTotals[appId] = (minutesTotals[appId] || 0) + monthShare;
      }
    }
  }

  return minutesMapToHoursMap(minutesTotals);
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
    minutes: normalizeMinutes(game.playtime_forever) || 0,
  }));
}

function buildTotalsMapFromGames(games) {
  const result = {};
  for (const game of games) {
    if (!game.appId) continue;
    result[game.appId] = normalizeMinutes(game.minutes) || 0;
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

  const dailyPayload = readJson(DAILY_FILE, {});
  const needsMigration = !Array.isArray(dailyPayload?.snapshots) || dailyPayload?.timezone !== STEAM_TIME_ZONE || dailyPayload?.version !== 2;
  const snapshotsBefore = loadDailySnapshots(dailyPayload);
  const beforeSerialized = serializeSnapshotsForCompare(snapshotsBefore);

  const targetDate = args.date || steamTodayKey();
  const targetCapturedAtMs = args.date ? steamDayEndUtcMs(targetDate) : Date.now();

  let snapshots = snapshotsBefore;
  if (args.date) {
    snapshots = snapshots.filter((snapshot) => steamDateKeyFromUtcMs(snapshot.capturedAtMs) !== targetDate);
  }

  const latest = snapshots[snapshots.length - 1];
  const latestDateKey = latest ? steamDateKeyFromUtcMs(latest.capturedAtMs) : "";
  const shouldAppend = !latest || !sameMinutesMap(latest.totalsMin, totalsMap) || latestDateKey !== targetDate || Boolean(args.date);

  if (shouldAppend && targetCapturedAtMs !== null) {
    snapshots = normalizeSnapshots([
      ...snapshots,
      {
        capturedAt: new Date(targetCapturedAtMs).toISOString(),
        totalsMin: totalsMap,
      },
    ], { monotonic: false });
  }

  const afterSerialized = serializeSnapshotsForCompare(snapshots);
  const updatedDaily = beforeSerialized !== afterSerialized;
  if (updatedDaily || needsMigration) {
    writeJson(DAILY_FILE, {
      version: 2,
      timezone: STEAM_TIME_ZONE,
      updatedAt: new Date().toISOString(),
      snapshots: normalizeSnapshots(snapshots, { monotonic: false }).map((snapshot) => ({
        capturedAt: snapshot.capturedAt,
        totalsMin: snapshot.totalsMin,
      })),
    });
  }

  const monthlyStore = readJson(MONTHLY_FILE, {});
  const monthlyBefore = JSON.stringify(monthlyStore);
  const currentMonth = steamNowMonth();
  const candidates = Array.from(new Set(listSnapshotDates(snapshots).map((key) => key.slice(0, 7))))
    .filter((monthKey) => /^\d{4}-\d{2}$/.test(monthKey))
    .sort((a, b) => a.localeCompare(b));

  const archivedMonths = [];
  for (const monthKey of candidates) {
    if (monthKey >= currentMonth) continue;
    if (Object.prototype.hasOwnProperty.call(monthlyStore, monthKey)) continue;
    if (!isMonthClosedInSnapshots(snapshots, monthKey)) continue;
    monthlyStore[monthKey] = computeMonthTotalsFromSnapshots(snapshots, monthKey);
    archivedMonths.push(monthKey);
  }

  const updatedMonthly = monthlyBefore !== JSON.stringify(monthlyStore);
  if (updatedMonthly) {
    writeJson(MONTHLY_FILE, monthlyStore);
  }

  console.log(`[steam] timezone: ${STEAM_TIME_ZONE}`);
  console.log(`[steam] snapshot date: ${targetDate}`);
  console.log(`[steam] games: ${games.length}`);
  console.log(`[steam] daily updated: ${updatedDaily || needsMigration ? "yes" : "no"}`);
  console.log(`[steam] monthly updated: ${updatedMonthly ? "yes" : "no"}`);
  if (archivedMonths.length > 0) {
    console.log(`[steam] archived months: ${archivedMonths.join(", ")}`);
  }
} catch (error) {
  console.error("[steam] snapshot sync failed:", error instanceof Error ? error.message : error);
  process.exit(1);
}
