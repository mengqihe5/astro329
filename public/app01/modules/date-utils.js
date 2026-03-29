export function currentMonthKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return year + "-" + month;
}

export function shiftMonth(value, step) {
  const raw = value || currentMonthKey();
  const bits = raw.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  if (!year || !month) return raw;
  const cursor = new Date(year, month - 1 + step, 1);
  const nextYear = cursor.getFullYear();
  const nextMonth = String(cursor.getMonth() + 1).padStart(2, "0");
  return nextYear + "-" + nextMonth;
}

export function formatMonthZh(value) {
  const raw = value || "";
  const bits = raw.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  if (!year || !month) return raw;
  return String(year) + "年" + String(month) + "月";
}

export function monthToIndex(value) {
  if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return null;
  const bits = value.split("-");
  const year = Number(bits[0]);
  const month = Number(bits[1]);
  if (!year || !month) return null;
  return year * 12 + (month - 1);
}

export function clampMonth(value, minMonth, maxMonth) {
  const current = /^\d{4}-\d{2}$/.test(String(value || "")) ? value : maxMonth;
  const valueIndex = monthToIndex(current);
  const minIndex = monthToIndex(minMonth);
  const maxIndex = monthToIndex(maxMonth);
  if (valueIndex === null || minIndex === null || maxIndex === null) return maxMonth;
  if (valueIndex < minIndex) return minMonth;
  if (valueIndex > maxIndex) return maxMonth;
  return current;
}

export function buildMonthRange(minMonth, maxMonth) {
  const values = [];
  let cursor = maxMonth;
  const minIndex = monthToIndex(minMonth);
  let guard = 0;
  while (monthToIndex(cursor) !== null && monthToIndex(cursor) >= minIndex && guard < 600) {
    values.push(cursor);
    cursor = shiftMonth(cursor, -1);
    guard += 1;
  }
  return values;
}
