import { initKpiCounters } from "./modules/counters.js";
import { initMutuallyExclusiveDetails } from "./modules/dropdowns.js";
import { initMonthDropdowns } from "./modules/month-dropdown.js";
import { initDashboardDayArticles } from "./modules/day-article-panel.js";
import { initChartHorizontalWheelBehavior } from "./modules/chart-scroll.js";
import { initBookCoverFallback } from "./modules/book-covers.js";
import { initScrollStability, initTouchScrollClickGuard, initSamePageLinkGuard } from "./modules/scroll-stability.js";

const runSafe = function (fn) {
  try {
    fn();
  } catch (error) {
    console.error("[app01] init failed:", error);
  }
};

let lastInitUrl = "";

const normalizePath = function (value) {
  if (!value) return "/";
  if (value.length > 1 && value.endsWith("/")) {
    return value.slice(0, -1);
  }
  return value;
};

const syncSidebarActiveState = function () {
  const currentPath = normalizePath(window.location.pathname);
  const navLinks = document.querySelectorAll(".sidebar .nav-link");
  if (!navLinks.length) return;

  navLinks.forEach(function (link) {
    if (!(link instanceof HTMLAnchorElement)) return;

    let linkPath = "/";
    try {
      linkPath = normalizePath(new URL(link.href, window.location.origin).pathname);
    } catch {
      linkPath = normalizePath(link.getAttribute("href") || "/");
    }

    const isActive = linkPath === currentPath;
    link.classList.toggle("active", isActive);
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });
};

const initPage = function () {
  const currentUrl = window.location.pathname + window.location.search;
  if (currentUrl === lastInitUrl) {
    return;
  }
  lastInitUrl = currentUrl;

  runSafe(initScrollStability);
  runSafe(initTouchScrollClickGuard);
  runSafe(initSamePageLinkGuard);
  runSafe(syncSidebarActiveState);
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
