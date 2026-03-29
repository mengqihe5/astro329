import { initThemeToggle } from "./modules/theme.js";
import { initKpiCounters } from "./modules/counters.js";
import { initMutuallyExclusiveDetails } from "./modules/dropdowns.js";
import { initMonthDropdowns } from "./modules/month-dropdown.js";
import { initDashboardDayArticles } from "./modules/day-article-panel.js";
import { initChartHorizontalWheelBehavior } from "./modules/chart-scroll.js";

initThemeToggle();
initKpiCounters();
initMutuallyExclusiveDetails();
initMonthDropdowns();
initDashboardDayArticles();
initChartHorizontalWheelBehavior();
