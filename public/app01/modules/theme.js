export function initThemeToggle() {
  const root = document.documentElement;
  const body = document.body;
  if (!root || !body) return;

  const themeKey = "blog_theme";
  const themeToggle = document.getElementById("themeToggle");

  const safeStorageGet = function (key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const safeStorageSet = function (key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  };

  const setTheme = function (themeName) {
    const nextTheme = themeName === "dark" ? "dark" : "light";
    root.dataset.theme = nextTheme;
    root.style.colorScheme = nextTheme;
    body.dataset.theme = nextTheme;
  };

  const savedTheme = safeStorageGet(themeKey) || root.dataset.theme || "light";
  setTheme(savedTheme);

  if (!themeToggle) return;
  if (themeToggle.dataset.themeBound === "1") return;
  themeToggle.dataset.themeBound = "1";

  themeToggle.addEventListener("click", function () {
    const nextTheme = root.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    safeStorageSet(themeKey, nextTheme);
  });
}
