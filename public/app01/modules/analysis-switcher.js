const DESKTOP_MEDIA_QUERY = "(min-width: 761px)";
const WHEEL_THRESHOLD = 72;
const WHEEL_IDLE_RESET_MS = 180;
const SWITCH_LOCK_MS = 360;

function setViewInteractivity(view, isActive) {
  view.classList.toggle("is-active", isActive);
  view.setAttribute("aria-hidden", isActive ? "false" : "true");

  if ("inert" in view) {
    view.inert = !isActive;
  }
}

function setupAnalysisSwitcher(switcher) {
  if (!(switcher instanceof HTMLElement) || switcher.dataset.analysisReady === "true") {
    return;
  }

  const views = Array.from(switcher.querySelectorAll("[data-analysis-view]")).filter(function (node) {
    return node instanceof HTMLElement;
  });
  if (views.length < 2) return;

  const section = switcher.closest(".dash-analysis") || switcher.parentElement;
  if (!(section instanceof HTMLElement)) return;

  const buttons = Array.from(section.querySelectorAll("[data-analysis-trigger]")).filter(function (node) {
    return node instanceof HTMLButtonElement;
  });
  const desktopMedia = window.matchMedia(DESKTOP_MEDIA_QUERY);

  let activeViewName = switcher.dataset.analysisInitial || "";
  if (!views.some(function (view) {
    return view.dataset.analysisView === activeViewName;
  })) {
    activeViewName = views[0].dataset.analysisView || "";
  }

  let wheelBuffer = 0;
  let lastWheelAt = 0;
  let lockUntil = 0;

  const resetWheelState = function () {
    wheelBuffer = 0;
    lastWheelAt = 0;
  };

  const syncUi = function () {
    views.forEach(function (view) {
      const isActive = view.dataset.analysisView === activeViewName;
      setViewInteractivity(view, isActive);
    });

    buttons.forEach(function (button) {
      const isActive = button.dataset.analysisTrigger === activeViewName;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
    });

    switcher.dataset.analysisCurrent = activeViewName;
  };

  const moveTo = function (nextViewName) {
    if (!nextViewName || nextViewName === activeViewName) {
      return false;
    }

    const targetExists = views.some(function (view) {
      return view.dataset.analysisView === nextViewName;
    });
    if (!targetExists) {
      return false;
    }

    activeViewName = nextViewName;
    syncUi();
    return true;
  };

  const moveByDirection = function (direction) {
    const activeIndex = views.findIndex(function (view) {
      return view.dataset.analysisView === activeViewName;
    });
    if (activeIndex < 0) return false;

    const nextIndex = activeIndex + direction;
    if (nextIndex < 0 || nextIndex >= views.length) {
      return false;
    }

    return moveTo(views[nextIndex].dataset.analysisView || "");
  };

  buttons.forEach(function (button) {
    button.addEventListener("click", function () {
      moveTo(button.dataset.analysisTrigger || "");
      resetWheelState();
    });
  });

  switcher.addEventListener(
    "wheel",
    function (event) {
      if (!desktopMedia.matches) return;
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;

      const direction = event.deltaY > 0 ? 1 : -1;
      const activeIndex = views.findIndex(function (view) {
        return view.dataset.analysisView === activeViewName;
      });
      if (activeIndex < 0) return;

      const nextIndex = activeIndex + direction;
      if (nextIndex < 0 || nextIndex >= views.length) {
        resetWheelState();
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const now = Date.now();
      if (now < lockUntil) {
        return;
      }

      if (now - lastWheelAt > WHEEL_IDLE_RESET_MS) {
        wheelBuffer = 0;
      }

      if (wheelBuffer !== 0 && Math.sign(wheelBuffer) !== Math.sign(event.deltaY)) {
        wheelBuffer = 0;
      }

      wheelBuffer += event.deltaY;
      lastWheelAt = now;

      const crossedThreshold =
        (direction > 0 && wheelBuffer >= WHEEL_THRESHOLD) ||
        (direction < 0 && wheelBuffer <= -WHEEL_THRESHOLD);

      if (!crossedThreshold) {
        return;
      }

      if (moveByDirection(direction)) {
        lockUntil = now + SWITCH_LOCK_MS;
      }
      resetWheelState();
    },
    { passive: false, capture: true }
  );

  if (typeof desktopMedia.addEventListener === "function") {
    desktopMedia.addEventListener("change", resetWheelState);
  } else if (typeof desktopMedia.addListener === "function") {
    desktopMedia.addListener(resetWheelState);
  }

  switcher.dataset.analysisReady = "true";
  syncUi();
}

export function initDashboardAnalysisSwitcher() {
  const switchers = document.querySelectorAll("[data-analysis-switcher]");
  switchers.forEach(setupAnalysisSwitcher);
}
