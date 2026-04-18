export function initMutuallyExclusiveDetails() {
  const getDropdowns = function () {
    return document.querySelectorAll(".sort-dropdown, .timeline-sort, .month-dropdown");
  };

  const closeAll = function (eventTarget) {
    getDropdowns().forEach(function (drop) {
      if (!drop.open) return;
      if (eventTarget && drop.contains(eventTarget)) return;
      drop.removeAttribute("open");
    });
  };

  getDropdowns().forEach(function (drop) {
    if (drop.dataset.exclusiveBound === "true") return;
    drop.dataset.exclusiveBound = "true";
    drop.addEventListener("toggle", function () {
      if (!drop.open) return;
      getDropdowns().forEach(function (other) {
        if (other !== drop) {
          other.removeAttribute("open");
        }
      });
    });
  });

  if (document.body.dataset.exclusiveDropdownGlobalBound === "true") return;
  document.body.dataset.exclusiveDropdownGlobalBound = "true";

  document.addEventListener("pointerdown", function (event) {
    closeAll(event.target);
  });

  document.addEventListener("click", function (event) {
    closeAll(event.target);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      closeAll(null);
    }
  });
}
