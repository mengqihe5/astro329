export function initChartHorizontalWheelBehavior() {
  const dailyBarWraps = document.querySelectorAll(".daily-bars-wrap");
  dailyBarWraps.forEach(function (wrap) {
    wrap.addEventListener(
      "wheel",
      function (event) {
        const before = wrap.scrollLeft;
        wrap.scrollLeft = before;
        if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
          event.preventDefault();
          window.scrollBy(0, event.deltaY);
        }
      },
      { passive: false }
    );
  });
}
