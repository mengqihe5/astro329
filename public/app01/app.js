import { initThemeToggle } from "./modules/theme.js";
import { initKpiCounters } from "./modules/counters.js";
import { initMutuallyExclusiveDetails } from "./modules/dropdowns.js";
import { initMonthDropdowns } from "./modules/month-dropdown.js";
import { initDashboardDayArticles } from "./modules/day-article-panel.js";
import { initChartHorizontalWheelBehavior } from "./modules/chart-scroll.js";

const runSafe = function (fn) {
  try {
    fn();
  } catch (error) {
    console.error("[app01] init failed:", error);
  }
};

runSafe(initThemeToggle);
runSafe(initKpiCounters);
runSafe(initMutuallyExclusiveDetails);
runSafe(initMonthDropdowns);
runSafe(initDashboardDayArticles);
runSafe(initChartHorizontalWheelBehavior);
