const runSafe = function (fn) {
  try {
    fn();
  } catch (error) {
    console.error("[app01] init failed:", error);
  }
};

const runAsyncSafe = async function (factory) {
  try {
    await factory();
  } catch (error) {
    console.error("[app01] async init failed:", error);
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

const hasNode = function (selector) {
  return Boolean(selector && document.querySelector(selector));
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

const initPage = async function () {
  const currentUrl = window.location.pathname + window.location.search;
  if (currentUrl === lastInitUrl) {
    return;
  }
  lastInitUrl = currentUrl;

  runSafe(syncSidebarActiveState);

  const initTasks = [
    runAsyncSafe(async function () {
      const module = await import("./modules/scroll-stability.js");
      runSafe(module.initScrollStability);
      runSafe(module.initTouchScrollClickGuard);
      runSafe(module.initSamePageLinkGuard);
    }),
  ];

  if (hasNode(".sort-dropdown, .timeline-sort, .month-dropdown")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/dropdowns.js");
        runSafe(module.initMutuallyExclusiveDetails);
      })
    );
  }

  if (hasNode(".kpi-value[data-count]")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/counters.js");
        runSafe(module.initKpiCounters);
      })
    );
  }

  if (hasNode("[data-month-dropdown]")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/month-dropdown.js");
        runSafe(module.initMonthDropdowns);
      })
    );
  }

  if (hasNode("[data-analysis-switcher]")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/analysis-switcher.js");
        runSafe(module.initDashboardAnalysisSwitcher);
      })
    );
  }

  if (hasNode("#dashboardCalendar") && hasNode("#dayArticlePanel")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/day-article-panel.js");
        runSafe(module.initDashboardDayArticles);
      })
    );
  }

  if (hasNode(".daily-bars-wrap")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/chart-scroll.js");
        runSafe(module.initChartHorizontalWheelBehavior);
      })
    );
  }

  if (hasNode("img[data-book-cover='1']")) {
    initTasks.push(
      runAsyncSafe(async function () {
        const module = await import("./modules/book-covers.js");
        runSafe(module.initBookCoverFallback);
      })
    );
  }

  await Promise.all(initTasks);
};

document.addEventListener("astro:page-load", initPage);

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPage, { once: true });
} else {
  initPage();
}
