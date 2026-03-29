export function initThemeToggle() {
  const body = document.body;
  if (!body) return;

  const themeKey = "blog_theme";
  const themeToggle = document.getElementById("themeToggle");

  const setTheme = function (themeName) {
    body.dataset.theme = themeName === "dark" ? "dark" : "light";
  };

  const savedTheme = localStorage.getItem(themeKey) || "light";
  setTheme(savedTheme);

  if (!themeToggle) return;
  themeToggle.addEventListener("click", function () {
    const nextTheme = body.dataset.theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    localStorage.setItem(themeKey, nextTheme);
  });
}
