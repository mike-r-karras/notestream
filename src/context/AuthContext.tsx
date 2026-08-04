"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

export interface User {
  id: number;
  username: string;
  email: string;
  type: "admin" | "regular";
  createdDatetime: string;
  modifiedDatetime: string;
  status: "active" | "suspended" | "deleted";
  hasAvatar: boolean;
  avatarUrl: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (usernameOrEmail: string, passwordHex: string) => Promise<User>;
  logout: () => Promise<void>;
  createProfile: (username: string, email: string, passwordHex: string) => Promise<User>;
  updateUserAvatar: (blob: Blob) => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[2]) : null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Initialize session on mount
  useEffect(() => {
    async function initSession() {
      const storedToken = getCookie("session_token");
      if (storedToken) {
        try {
          const res = await fetch(`${API_BASE_URL}/api/auth/session`, {
            headers: {
              Authorization: `Bearer ${storedToken}`,
            },
          });
          if (res.ok) {
            const result = await res.json();
            setUser(result.data.user);
            setToken(storedToken);
          } else {
            // Token is invalid/expired
            document.cookie = "session_token=; max-age=0; path=/; sameSite=lax";
          }
        } catch (e) {
          console.error("Failed to fetch session", e);
        }
      }
      setLoading(false);
    }
    initSession();
  }, []);

  const login = async (usernameOrEmail: string, passwordHex: string): Promise<User> => {
    const res = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: usernameOrEmail,
        passwordHash: passwordHex,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Login failed");
    }

    const result = await res.json();
    const sessionToken = result.data.token;
    const sessionUser = result.data.user;

    // Save session in cookie for 1 week (604800 seconds)
    document.cookie = `session_token=${sessionToken}; max-age=604800; path=/; sameSite=lax`;

    setUser(sessionUser);
    setToken(sessionToken);
    return sessionUser;
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
      } catch (e) {
        console.error("Logout request failed", e);
      }
    }
    document.cookie = "session_token=; max-age=0; path=/; sameSite=lax";
    setUser(null);
    setToken(null);
  };

  const createProfile = async (username: string, email: string, passwordHex: string): Promise<User> => {
    // 1. Create user
    const res = await fetch(`${API_BASE_URL}/api/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username,
        email,
        passwordHash: passwordHex,
      }),
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to create profile");
    }

    // 2. Automatically log in after profile creation
    return login(username, passwordHex);
  };

  const refreshUser = async () => {
    if (!token || !user) return;
    try {
      const res = await fetch(`${API_BASE_URL}/api/users/${user.id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (res.ok) {
        const result = await res.json();
        setUser(result.data);
      }
    } catch (e) {
      console.error("Failed to refresh user info", e);
    }
  };

  const updateUserAvatar = async (blob: Blob) => {
    if (!token || !user) throw new Error("Authentication required");

    const res = await fetch(`${API_BASE_URL}/api/users/${user.id}/avatar`, {
      method: "PUT",
      headers: {
        "Content-Type": "image/png",
        Authorization: `Bearer ${token}`,
      },
      body: blob,
    });

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(errBody.error || "Failed to upload avatar");
    }

    await refreshUser();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        createProfile,
        updateUserAvatar,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
