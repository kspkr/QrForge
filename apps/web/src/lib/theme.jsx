import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "./storage.js";

const ThemeContext = createContext(null);
const KEY = "qrforge-theme";

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => storage.get(KEY) || "system");
  const [resolved, setResolved] = useState(() =>
    theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme,
  );

  useEffect(() => {
    const apply = () => {
      const next = theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
      setResolved(next);
      document.documentElement.classList.toggle("dark", next === "dark");
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next === "dark" ? "#09090b" : "#ffffff");
    };
    apply();
    if (theme !== "system") return undefined;
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    mq?.addEventListener("change", apply);
    return () => mq?.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = useCallback((next) => {
    storage.set(KEY, next);
    setThemeState(next);
  }, []);

  return <ThemeContext.Provider value={{ theme, resolved, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
