/**
 * Server + session state.
 *
 * The Studio works with no server at all. When a QRForge server is reachable
 * (same origin), dashboard features light up.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, setCsrfToken } from "./api.js";
import { STATIC_ONLY } from "./config.js";

const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  // server: undefined = checking, null = not available, object = /config response
  const [server, setServer] = useState(undefined);
  const [user, setUser] = useState(undefined);

  const applyAuth = useCallback((data) => {
    setCsrfToken(data?.csrf_token);
    setUser(data?.user ?? null);
    return data?.user ?? null;
  }, []);

  const refresh = useCallback(async () => {
    if (STATIC_ONLY) {
      setServer(null);
      setUser(null);
      return;
    }
    try {
      const config = await api.get("/config");
      setServer(config);
    } catch {
      setServer(null);
      setUser(null);
      return;
    }
    try {
      applyAuth(await api.get("/auth/me"));
    } catch {
      applyAuth(null);
    }
  }, [applyAuth]);

  useEffect(() => {
    // Fetch server config + session once on mount; state is set after the requests resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      server,
      user,
      loading: server === undefined || (server !== null && user === undefined),
      refresh,
      async login(email, password) {
        return applyAuth(await api.post("/auth/login", { email, password }));
      },
      async register(name, email, password) {
        const u = applyAuth(await api.post("/auth/register", { name, email, password }));
        setServer((s) => (s ? { ...s, setup_required: false } : s));
        return u;
      },
      async logout() {
        try {
          await api.post("/auth/logout");
        } finally {
          applyAuth(null);
        }
      },
      setUser,
    }),
    [server, user, refresh, applyAuth],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside <SessionProvider>");
  return ctx;
}
