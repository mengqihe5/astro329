import { buildMonthRange, clampMonth, currentMonthKey, formatMonthZh, monthToIndex } from "./date-utils.js";

const monthRangeCache = new Map();

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage failures (private mode / blocked storage).
  }
}

export function initMonthDropdowns() {
  const monthDropdowns = document.querySelectorAll("[data-month-dropdown]");

  monthDropdowns.forEach(function (dropdown) {
    const form = dropdown.querySelector("[data-month-form]");
    const monthInput = dropdown.querySelector("[data-month-input]");
    const listNode = dropdown.querySelector("[data-month-list]");
    if (!form || !monthInput || !listNode) return;

    const minMonth = /^\d{4}-\d{2}$/.test(dropdown.dataset.monthMin || "") ? dropdown.dataset.monthMin : currentMonthKey();
    const maxMonth = /^\d{4}-\d{2}$/.test(dropdown.dataset.monthMax || "") ? dropdown.dataset.monthMax : currentMonthKey();
    const boundedMin = monthToIndex(minMonth) !== null && monthToIndex(minMonth) <= monthToIndex(maxMonth) ? minMonth : maxMonth;
    const monthRangeKey = boundedMin + "|" + maxMonth;

    const labelNode = dropdown.querySelector(".month-dropdown-label");
    const monthStoreKey = dropdown.dataset.monthStoreKey || ("month_picker_last_" + window.location.pathname.replace(/[^a-zA-Z0-9]/g, "_"));
    const summaryNode = dropdown.querySelector("summary");
    const arrowInSummary = summaryNode ? summaryNode.querySelector("[data-month-arrow]") : null;

    const syncMonthText = function () {
      const clampedValue = clampMonth(monthInput.value, boundedMin, maxMonth);
      monthInput.value = clampedValue;
      if (clampedValue) {
        safeStorageSet(monthStoreKey, clampedValue);
      }
      if (labelNode) {
        labelNode.textContent = formatMonthZh(clampedValue);
      }
    };
    syncMonthText();

    const confirmMonth = function (value) {
      monthInput.value = clampMonth(value, boundedMin, maxMonth);
      syncMonthText();
      if (form.requestSubmit) {
        form.requestSubmit();
      } else {
        form.submit();
      }
      dropdown.removeAttribute("open");
    };

    const renderMonthOptions = function () {
      const currentMonth = clampMonth(monthInput.value || safeStorageGet(monthStoreKey) || maxMonth, boundedMin, maxMonth);
      monthInput.value = currentMonth;

      if (!monthRangeCache.has(monthRangeKey)) {
        monthRangeCache.set(monthRangeKey, buildMonthRange(boundedMin, maxMonth));
      }
      const rawMonthOptions = monthRangeCache.get(monthRangeKey) || [];
      const monthOptions = rawMonthOptions.length > 0 ? rawMonthOptions : [currentMonth];

      listNode.innerHTML = "";
      let selectedNode = null;
      const fragment = document.createDocumentFragment();

      monthOptions.forEach(function (monthValue) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "month-option";
        button.dataset.monthValue = monthValue;
        button.textContent = formatMonthZh(monthValue);
        if (monthValue === monthInput.value) {
          button.classList.add("selected");
          selectedNode = button;
        }
        button.addEventListener("click", function () {
          safeStorageSet(monthStoreKey, monthValue);
          confirmMonth(monthValue);
        });
        fragment.appendChild(button);
      });

      listNode.appendChild(fragment);

      if (selectedNode) {
        requestAnimationFrame(function () {
          selectedNode.scrollIntoView({ block: "center" });
        });
      }
    };

    if (summaryNode && dropdown.dataset.arrowOnly === "true") {
      summaryNode.addEventListener("click", function (event) {
        const target = event.target;
        const clickedArrow = Boolean(arrowInSummary && (target === arrowInSummary || arrowInSummary.contains(target)));

        if (!clickedArrow) {
          event.preventDefault();
          if (dropdown.dataset.monthMode !== "month" && dropdown.dataset.switchUrl) {
            window.location.href = dropdown.dataset.switchUrl;
          }
        }
      });
    }

    dropdown.addEventListener("toggle", function () {
      if (dropdown.open) {
        renderMonthOptions();
      }
    });

    listNode.addEventListener(
      "wheel",
      function (event) {
        event.preventDefault();
        const speed = 2.6;
        listNode.scrollTop += event.deltaY * speed;
      },
      { passive: false }
    );
  });
}
