import { initThemeToggle } from "./modules/theme.js";
import { initKpiCounters } from "./modules/counters.js";
import { initMutuallyExclusiveDetails } from "./modules/dropdowns.js";
import { initMonthDropdowns } from "./modules/month-dropdown.js";
import { initDashboardDayArticles } from "./modules/day-article-panel.js";
import { initChartHorizontalWheelBehavior } from "./modules/chart-scroll.js";
import { initBookCoverFallback } from "./modules/book-covers.js";
import { initScrollStability, initTouchScrollClickGuard } from "./modules/scroll-stability.js";

const runSafe = function (fn) {
  try {
    fn();
  } catch (error) {
    console.error("[app01] init failed:", error);
  }
};

let lastInitUrl = "";

const initPage = function () {
  const currentUrl = window.location.pathname + window.location.search;
  if (currentUrl === lastInitUrl) {
    return;
  }
  lastInitUrl = currentUrl;

  runSafe(initThemeToggle);
  runSafe(initScrollStability);
  runSafe(initTouchScrollClickGuard);
  runSafe(initKpiCounters);
  runSafe(initMutuallyExclusiveDetails);
  runSafe(initMonthDropdowns);
  runSafe(initDashboardDayArticles);
  runSafe(initChartHorizontalWheelBehavior);
  runSafe(initBookCoverFallback);
};

document.addEventListener("astro:page-load", initPage);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPage, { once: true });
} else {
  initPage();
}
