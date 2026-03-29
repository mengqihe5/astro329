export function initMutuallyExclusiveDetails() {
  const dropdowns = document.querySelectorAll(".sort-dropdown, .timeline-sort, .month-dropdown");
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

  document.addEventListener("click", function (event) {
    dropdowns.forEach(function (drop) {
      if (drop.open && !drop.contains(event.target)) {
        drop.removeAttribute("open");
      }
    });
  });
}
