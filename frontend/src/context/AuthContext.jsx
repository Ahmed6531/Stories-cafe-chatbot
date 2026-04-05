import { useState, useEffect, useCallback } from "react";
import http from "../API/http";
import { AuthContext } from "./AuthContext.js";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshSession = useCallback(async ({ markLoading = true } = {}) => {
    if (markLoading) setLoading(true);
    try {
      const res = await http.get("/auth/me");
      setUser(res.data.user ?? null);
      return res.data.user ?? null;
    } catch {
      setUser(null);
      return null;
    } finally {
      if (markLoading) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSession();
  }, [refreshSession]);

  useEffect(() => {
    const revalidateSession = () => {
      void refreshSession();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        revalidateSession();
      }
    };

    window.addEventListener("pageshow", revalidateSession);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.removeEventListener("pageshow", revalidateSession);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshSession]);

  const logout = useCallback(async () => {
    await http.post("/auth/logout").catch(() => {});
    setUser(null);
    setLoading(false);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}
