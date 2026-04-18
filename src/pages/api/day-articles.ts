import { loadArticles, resolveMonth, formatMonthLabel, renderDayArticlePanel } from "../../lib/blog.js";

export const prerender = false;

export async function GET({ url }) {
  const selectedMonth = resolveMonth(url.searchParams.get("month") || "");
  const selectedDayRaw = url.searchParams.get("day") || "";
  const selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(selectedDayRaw) && selectedDayRaw.startsWith(selectedMonth) ? selectedDayRaw : "";

  const allArticles = loadArticles("desc");
  const monthArticles = allArticles.filter((item) => item.date.startsWith(selectedMonth));
  const calendarArticles = selectedDay ? monthArticles.filter((item) => item.date === selectedDay) : monthArticles;
  const selectedDayLabel = selectedDay || `${formatMonthLabel(selectedMonth)} 全部文章`;

  return new Response(renderDayArticlePanel(selectedDayLabel, calendarArticles), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
