import { createContext, useState, useEffect, useCallback } from "react";
import http from "../API/http";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    http.get("/auth/me")
      .then((res) => setUser(res.data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false));
  }, []);

  const refreshSession = useCallback(async () => {
    const res = await http.get("/auth/me");
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    await http.post("/auth/logout").catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, logout, refreshSession }}>
      {children}
    </AuthContext.Provider>
  );
}
