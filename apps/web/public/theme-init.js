// Applies the saved or system colour scheme before first paint to avoid a flash.
// Kept as an external file so the Content-Security-Policy can forbid inline scripts.
(function () {
  var theme = "system";
  try {
    theme = localStorage.getItem("qrforge-theme") || "system";
  } catch (e) {}
  var dark = theme === "dark" || (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
})();
