export function initThemeToggle() {
  const body = document.body;
  if (!body) return;

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
    body.dataset.theme = themeName === "dark" ? "dark" : "light";
  };

  const savedTheme = safeStorageGet(themeKey) || "light";
  setTheme(savedTheme);

  if (!themeToggle) return;
  themeToggle.addEventListener("click", function () {
    const nextTheme = body.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    safeStorageSet(themeKey, nextTheme);
  });
}
