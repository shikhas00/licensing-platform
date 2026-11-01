import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { User } from "../types";
import { setAuthHeaders } from "../api/client";

interface AuthContextType {
  user: User | null;
  login: (userId: string, role: "operator" | "officer") => void;
  logout: () => void;
  switchRole: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    // Load from localStorage on init
    const saved = localStorage.getItem("auth_user");
    if (saved) {
      const parsedUser = JSON.parse(saved) as User;
      // Set auth headers immediately on load
      setAuthHeaders(parsedUser);
      return parsedUser;
    }
    return null;
  });

  useEffect(() => {
    // Set auth headers when user changes
    if (user) {
      setAuthHeaders(user);
      localStorage.setItem("auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("auth_user");
    }
  }, [user]);

  const login = (userId: string, role: "operator" | "officer") => {
    setUser({ userId, role });
  };

  const logout = () => {
    setUser(null);
  };

  const switchRole = () => {
    if (user) {
      const newRole = user.role === "operator" ? "officer" : "operator";
      setUser({ ...user, role: newRole });
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, switchRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
