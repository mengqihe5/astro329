export function initMutuallyExclusiveDetails() {
  const dropdowns = document.querySelectorAll(".sort-dropdown, .timeline-sort, .month-dropdown");

  const closeAll = function (eventTarget) {
    dropdowns.forEach(function (drop) {
      if (!drop.open) return;
      if (eventTarget && drop.contains(eventTarget)) return;
      drop.removeAttribute("open");
    });
  };

  dropdowns.forEach(function (drop) {
    drop.addEventListener("toggle", function () {
      if (!drop.open) return;
      dropdowns.forEach(function (other) {
        if (other !== drop) {
          other.removeAttribute("open");
        }
      });
    });
  });

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
