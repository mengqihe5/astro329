function safeSessionGet(key) {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSessionSet(key, value) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

function currentScrollKey() {
  return "app01_scroll_" + window.location.pathname + window.location.search;
}

export function initScrollStability() {
  if (!document.body || document.body.dataset.scrollStabilityBound === "true") return;
  document.body.dataset.scrollStabilityBound = "true";

  if ("scrollRestoration" in history) {
    history.scrollRestoration = "manual";
  }

  let saveScheduled = false;

  const saveScrollPosition = function () {
    const top = Math.max(0, window.scrollY || window.pageYOffset || 0);
    safeSessionSet(currentScrollKey(), String(top));
  };

  const scheduleSave = function () {
    if (saveScheduled) return;
    saveScheduled = true;
    requestAnimationFrame(function () {
      saveScheduled = false;
      saveScrollPosition();
    });
  };

  const restoreScrollPosition = function () {
    const raw = safeSessionGet(currentScrollKey());
    const top = Number(raw || "0");
    if (!Number.isFinite(top) || top <= 0) return;
    requestAnimationFrame(function () {
      window.scrollTo(0, top);
    });
  };

  document.addEventListener("scroll", scheduleSave, { passive: true });
  window.addEventListener("pagehide", saveScrollPosition);
  window.addEventListener("beforeunload", saveScrollPosition);
  window.addEventListener("pageshow", restoreScrollPosition, { once: true });

  restoreScrollPosition();
}

export function initTouchScrollClickGuard() {
  if (!document.body || document.body.dataset.touchScrollGuardBound === "true") return;
  if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
  document.body.dataset.touchScrollGuardBound = "true";

  const moveThreshold = 10;
  const blockWindowMs = 420;

  let startX = 0;
  let startY = 0;
  let tracking = false;
  let suppressClickUntil = 0;

  document.addEventListener(
    "touchstart",
    function (event) {
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      tracking = true;
      startX = touch.clientX;
      startY = touch.clientY;
    },
    { passive: true }
  );

  document.addEventListener(
    "touchmove",
    function (event) {
      if (!tracking) return;
      const touch = event.touches && event.touches[0];
      if (!touch) return;
      const movedX = Math.abs(touch.clientX - startX);
      const movedY = Math.abs(touch.clientY - startY);
      if (movedX > moveThreshold || movedY > moveThreshold) {
        suppressClickUntil = Date.now() + blockWindowMs;
        tracking = false;
      }
    },
    { passive: true }
  );

  const stopTracking = function () {
    tracking = false;
  };

  document.addEventListener("touchend", stopTracking, { passive: true });
  document.addEventListener("touchcancel", stopTracking, { passive: true });

  document.addEventListener(
    "click",
    function (event) {
      if (Date.now() > suppressClickUntil) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const clickableNode = target.closest("a, summary");
      if (!clickableNode) return;
      event.preventDefault();
      event.stopPropagation();
    },
    true
  );
}

export function initSamePageLinkGuard() {
  if (!document.body || document.body.dataset.samePageLinkGuardBound === "true") return;
  if (!window.matchMedia("(hover: none) and (pointer: coarse)").matches) return;
  document.body.dataset.samePageLinkGuardBound = "true";

  document.addEventListener(
    "click",
    function (event) {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const link = target.closest("a[href]");
      if (!link) return;

      let url;
      try {
        url = new URL(link.getAttribute("href") || "", window.location.origin);
      } catch {
        return;
      }

      const samePage = url.pathname === window.location.pathname && url.search === window.location.search;
      if (!samePage) return;

      if (link.classList.contains("nav-link") || link.classList.contains("active")) {
        event.preventDefault();
        event.stopPropagation();
      }
    },
    true
  );
}
