function initDayArticlePagination(panel) {
  if (!panel) return;
  const grid = panel.querySelector(".day-article-grid");
  if (!grid) return;

  const oldPager = panel.querySelector(".day-article-pagination");
  if (oldPager) {
    oldPager.remove();
  }

  const cards = Array.from(grid.querySelectorAll(".day-article-card"));
  if (cards.length === 0) return;

  const pageSize = 4;
  const totalPages = Math.max(1, Math.ceil(cards.length / pageSize));
  let currentPage = 1;

  const pager = document.createElement("div");
  pager.className = "day-article-pagination";

  const pageButtons = [];
  const renderPage = function (pageNumber) {
    currentPage = Math.min(Math.max(1, pageNumber), totalPages);
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    cards.forEach(function (card, index) {
      card.style.display = index >= start && index < end ? "" : "none";
    });
    pageButtons.forEach(function (button, idx) {
      button.classList.toggle("active", idx + 1 === currentPage);
    });
  };

  for (let page = 1; page <= totalPages; page += 1) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-page-btn";
    button.textContent = String(page);
    button.addEventListener("click", function () {
      renderPage(page);
    });
    pageButtons.push(button);
    pager.appendChild(button);
  }

  grid.insertAdjacentElement("afterend", pager);
  renderPage(1);
}

export function initDashboardDayArticles() {
  const calendarGrid = document.getElementById("dashboardCalendar");
  const articlePanel = document.getElementById("dayArticlePanel");
  if (!calendarGrid || !articlePanel) return;

  const dayArticleCache = new Map();
  let activeDayRequestController = null;
  let activeDayRequestId = 0;

  const applyActiveDay = function (dayLink) {
    calendarGrid.querySelectorAll(".calendar-day-link.active").forEach(function (node) {
      node.classList.remove("active");
    });
    dayLink.classList.add("active");
  };

  const syncHistoryWithDay = function (dayLink) {
    const fullUrl = new URL(dayLink.href, window.location.origin);
    history.replaceState({}, "", fullUrl.pathname + fullUrl.search);
  };

  initDayArticlePagination(articlePanel);

  calendarGrid.addEventListener("click", function (event) {
    const dayLink = event.target.closest("a.calendar-day-link");
    if (!dayLink) return;
    event.preventDefault();

    const fullUrlForClick = new URL(dayLink.href, window.location.origin);
    const partialUrl = new URL("/api/day-articles", window.location.origin);
    const monthValue = fullUrlForClick.searchParams.get("month");
    const dayValue = fullUrlForClick.searchParams.get("day");
    if (monthValue) {
      partialUrl.searchParams.set("month", monthValue);
    }
    if (dayValue) {
      partialUrl.searchParams.set("day", dayValue);
    }
    const cacheKey = partialUrl.toString();

    if (dayArticleCache.has(cacheKey)) {
      articlePanel.innerHTML = dayArticleCache.get(cacheKey);
      initDayArticlePagination(articlePanel);
      applyActiveDay(dayLink);
      syncHistoryWithDay(dayLink);
      return;
    }

    if (activeDayRequestController) {
      activeDayRequestController.abort();
    }
    activeDayRequestController = new AbortController();
    const requestId = ++activeDayRequestId;

    fetch(partialUrl.toString(), {
      headers: {
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: activeDayRequestController.signal,
    })
      .then(function (response) {
        if (!response.ok) {
          throw new Error("partial-failed");
        }
        return response.text();
      })
      .then(function (html) {
        if (requestId !== activeDayRequestId) {
          return;
        }
        dayArticleCache.set(cacheKey, html);
        articlePanel.innerHTML = html;
        initDayArticlePagination(articlePanel);
        applyActiveDay(dayLink);
        syncHistoryWithDay(dayLink);
      })
      .catch(function (error) {
        if (error && error.name === "AbortError") {
          return;
        }
        window.location.href = dayLink.href;
      });
  });
}
