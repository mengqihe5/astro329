(function () {
    const themeKey = "blog_theme";
    const body = document.body;
    const themeToggle = document.getElementById("themeToggle");

    function setTheme(themeName) {
        body.dataset.theme = themeName === "dark" ? "dark" : "light";
    }

    function shiftMonth(value, step) {
        const raw = value || currentMonthKey();
        const bits = raw.split("-");
        const year = Number(bits[0]);
        const month = Number(bits[1]);
        if (!year || !month) return raw;
        const cursor = new Date(year, month - 1 + step, 1);
        const nextYear = cursor.getFullYear();
        const nextMonth = String(cursor.getMonth() + 1).padStart(2, "0");
        return nextYear + "-" + nextMonth;
    }

    function formatMonthZh(value) {
        const raw = value || "";
        const bits = raw.split("-");
        const year = Number(bits[0]);
        const month = Number(bits[1]);
        if (!year || !month) return raw;
        return String(year) + "\u5e74" + String(month) + "\u6708";
    }


    function currentMonthKey() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, "0");
        return year + "-" + month;
    }

    const savedTheme = localStorage.getItem(themeKey) || "light";
    setTheme(savedTheme);

    if (themeToggle) {
        themeToggle.addEventListener("click", function () {
            const nextTheme = body.dataset.theme === "dark" ? "light" : "dark";
            setTheme(nextTheme);
            localStorage.setItem(themeKey, nextTheme);
        });
    }

    // Animated counters for dashboard KPI cards.
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

    // Close other open dropdown menus when one is opened.
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

    // Generic month dropdown: wheel changes focus, click option confirms.
    const monthDropdowns = document.querySelectorAll("[data-month-dropdown]");

    const monthToIndex = function (value) {
        if (!/^\d{4}-\d{2}$/.test(String(value || ""))) return null;
        const bits = value.split("-");
        const year = Number(bits[0]);
        const month = Number(bits[1]);
        if (!year || !month) return null;
        return year * 12 + (month - 1);
    };

    const clampMonth = function (value, minMonth, maxMonth) {
        const current = /^\d{4}-\d{2}$/.test(String(value || "")) ? value : maxMonth;
        const valueIndex = monthToIndex(current);
        const minIndex = monthToIndex(minMonth);
        const maxIndex = monthToIndex(maxMonth);
        if (valueIndex === null || minIndex === null || maxIndex === null) return maxMonth;
        if (valueIndex < minIndex) return minMonth;
        if (valueIndex > maxIndex) return maxMonth;
        return current;
    };

    const buildMonthRange = function (minMonth, maxMonth) {
        const values = [];
        let cursor = maxMonth;
        const minIndex = monthToIndex(minMonth);
        let guard = 0;
        while (monthToIndex(cursor) !== null && monthToIndex(cursor) >= minIndex && guard < 600) {
            values.push(cursor);
            cursor = shiftMonth(cursor, -1);
            guard += 1;
        }
        return values;
    };

    monthDropdowns.forEach(function (dropdown) {
        const form = dropdown.querySelector("[data-month-form]");
        const monthInput = dropdown.querySelector("[data-month-input]");
        const listNode = dropdown.querySelector("[data-month-list]");
        if (!form || !monthInput || !listNode) return;

        const minMonth = /^\d{4}-\d{2}$/.test(dropdown.dataset.monthMin || "") ? dropdown.dataset.monthMin : "2025-03";
        const maxMonth = /^\d{4}-\d{2}$/.test(dropdown.dataset.monthMax || "") ? dropdown.dataset.monthMax : currentMonthKey();
        const boundedMin = monthToIndex(minMonth) !== null && monthToIndex(minMonth) <= monthToIndex(maxMonth) ? minMonth : maxMonth;

        const labelNode = dropdown.querySelector(".month-dropdown-label");
        const monthStoreKey = "month_picker_last";
        const summaryNode = dropdown.querySelector("summary");
        const labelInSummary = summaryNode ? summaryNode.querySelector("[data-month-label]") : null;
        const arrowInSummary = summaryNode ? summaryNode.querySelector("[data-month-arrow]") : null;

        const syncMonthText = function () {
            if (monthInput.value) {
                localStorage.setItem(monthStoreKey, monthInput.value);
            }
            if (labelNode) {
                labelNode.textContent = formatMonthZh(monthInput.value);
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
            const currentMonth = clampMonth(monthInput.value || localStorage.getItem(monthStoreKey) || maxMonth, boundedMin, maxMonth);
            monthInput.value = currentMonth;
            const options = buildMonthRange(boundedMin, maxMonth);
            listNode.innerHTML = "";
            let selectedNode = null;
            options.forEach(function (monthValue) {
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
                    localStorage.setItem(monthStoreKey, monthValue);
                    confirmMonth(monthValue);
                });
                listNode.appendChild(button);
            });

            // Open list at the previously selected month position.
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
                const clickedLabel = Boolean(labelInSummary && (target === labelInSummary || labelInSummary.contains(target)));

                if (clickedLabel) {
                    event.preventDefault();
                    if (dropdown.dataset.monthMode !== "month" && dropdown.dataset.switchUrl) {
                        window.location.href = dropdown.dataset.switchUrl;
                    }
                    return;
                }

                if (!clickedArrow) {
                    event.preventDefault();
                }
            });
        }

        dropdown.addEventListener("toggle", function () {
            if (dropdown.open) {
                renderMonthOptions();
            }
        });

        // Faster wheel scrolling inside month list.
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

    document.addEventListener("click", function (event) {
        monthDropdowns.forEach(function (dropdown) {
            if (dropdown.open && !dropdown.contains(event.target)) {
                dropdown.removeAttribute("open");
            }
        });
    });

    // Dashboard calendar: fetch right-side article panel without full page reload.
    const calendarGrid = document.getElementById("dashboardCalendar");
    const articlePanel = document.getElementById("dayArticlePanel");
    if (calendarGrid && articlePanel) {
        const dayArticleCache = new Map();

        calendarGrid.addEventListener("click", function (event) {
            const dayLink = event.target.closest("a.calendar-day-link");
            if (!dayLink) return;
            event.preventDefault();

            const fullUrlForClick = new URL(dayLink.href, window.location.origin);
            const partialUrl = new URL("/api/day-articles", window.location.origin);
            const monthValue = fullUrlForClick.searchParams.get("month");
            const dayValue = fullUrlForClick.searchParams.get("day");
            if (monthValue) {
                partialUrl.searchParams.set("month", monthValue);
            }
            if (dayValue) {
                partialUrl.searchParams.set("day", dayValue);
            }
            const cacheKey = partialUrl.toString();

            if (dayArticleCache.has(cacheKey)) {
                articlePanel.innerHTML = dayArticleCache.get(cacheKey);
                calendarGrid.querySelectorAll(".calendar-day-link.active").forEach(function (node) {
                    node.classList.remove("active");
                });
                dayLink.classList.add("active");
                const fullUrlCached = new URL(dayLink.href, window.location.origin);
                history.replaceState({}, "", fullUrlCached.pathname + fullUrlCached.search);
                return;
            }

            fetch(partialUrl.toString(), {
                headers: {
                    "X-Requested-With": "XMLHttpRequest",
                },
            })
                .then(function (response) {
                    if (!response.ok) {
                        throw new Error("partial-failed");
                    }
                    return response.text();
                })
                .then(function (html) {
                    dayArticleCache.set(cacheKey, html);
                    articlePanel.innerHTML = html;
                    calendarGrid.querySelectorAll(".calendar-day-link.active").forEach(function (node) {
                        node.classList.remove("active");
                    });
                    dayLink.classList.add("active");
                    const fullUrl = new URL(dayLink.href, window.location.origin);
                    history.replaceState({}, "", fullUrl.pathname + fullUrl.search);
                })
                .catch(function () {
                    window.location.href = dayLink.href;
                });
        });
    }

    // Disable wheel-based horizontal scrolling inside bars area; keep scrollbar drag only.
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
})();




