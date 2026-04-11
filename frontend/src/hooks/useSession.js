import { useContext } from "react";
import { AuthContext } from "../context/AuthContext.js";

export function useSession() {
  const ctx = useContext(AuthContext);
  if (ctx === null) {
    throw new Error("useSession must be used inside AuthProvider");
  }
  return ctx;
}
