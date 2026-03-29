export function initKpiCounters() {
  const kpiValues = document.querySelectorAll(".kpi-value[data-count]");
  kpiValues.forEach(function (node) {
    const target = Number(node.dataset.count || "0");
    if (!Number.isFinite(target) || target === 0) {
      node.textContent = "0";
      return;
    }

    const duration = 700;
    const start = performance.now();
    const decimals = String(target).includes(".") ? 1 : 0;

    function tick(now) {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      const value = target * eased;
      node.textContent = value.toFixed(decimals);
      if (p < 1) {
        requestAnimationFrame(tick);
      } else {
        node.textContent = target.toFixed(decimals);
      }
    }

    requestAnimationFrame(tick);
  });
}
