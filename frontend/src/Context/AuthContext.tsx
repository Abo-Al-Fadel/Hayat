// src/context/AuthContext.tsx
/**
 * SHARED SESSION AUTH CONTEXT
 * 
 * RULES:
 * - localStorage ONLY (shared across all tabs of same host)
 * - All tabs share the same JWT token
 * - Logout in one tab triggers logout in all tabs
 * - Storage event listener syncs auth state across tabs
 * 
 * Keys:
 * - token: JWT token
 * - user: JSON user object
 */
import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from "react";
import { loginAPI } from "../Services/AuthService";
import { stopAllSignalRConnections } from "../hooks/useSignalR";
import {
  TOKEN_KEY,
  USER_KEY,
  isTokenExpired,
  millisecondsUntilExpiry,
  clearSessionStorage,
  getValidToken,
} from "../utils/token";
import { handleSessionExpired } from "../Services/sessionExpiry";

export type User = {
  id: string;
  username: string;
  email: string;
  role: string;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  login: (username: string, password: string) => Promise<User>;
  logout: () => void;
  isAuthenticated: boolean;
  loading: boolean;
  isLoggedIn: () => boolean;
  isLoggingOut: boolean;
};

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  
  // Anti-logout-loop protection
  const isLoggingOutRef = useRef(false);

  // Load from localStorage on mount (shared across tabs)
  useEffect(() => {
    try {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUser = localStorage.getItem(USER_KEY);

      // An expired token is not a session. Restoring it used to leave the app
      // "signed in" with every request failing.
      if (storedToken && isTokenExpired(storedToken)) {
        clearSessionStorage();
      } else if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser) as User;
        setToken(storedToken);
        setUser(parsedUser);
      }
    } catch (err) {
      console.error("[Auth] Failed to parse session, clearing:", err);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Sign out exactly when the token expires, rather than waiting for the user to
  // click something and discover a dashboard that cannot load anything.
  useEffect(() => {
    if (!token) return;

    const remaining = millisecondsUntilExpiry(token);
    if (remaining <= 0) {
      handleSessionExpired();
      return;
    }

    // setTimeout saturates above ~24.8 days; sessions are far shorter, but clamp anyway.
    const delay = Math.min(remaining, 2_147_483_647);
    const timer = window.setTimeout(() => handleSessionExpired(), delay);
    return () => window.clearTimeout(timer);
  }, [token]);

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        if (e.newValue === null) {
          // Token was removed (logout from another tab)
          setToken(null);
          setUser(null);
          window.location.href = "/login";
        } else if (e.newValue !== token) {
          // Token was changed (login from another tab)
          setToken(e.newValue);
          const storedUser = localStorage.getItem(USER_KEY);
          if (storedUser) {
            try {
              setUser(JSON.parse(storedUser));
            } catch {}
          }
        }
      }
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, [token]);

  // Login - stores in localStorage (shared across all tabs)
  const login = useCallback(async (username: string, password: string): Promise<User> => {
    const res = await loginAPI(username, password);
    
    if (!res.token) {
      throw new Error("Login failed: no token returned");
    }

    const mappedUser: User = {
      id: res.user.id,
      username: res.user.username,
      email: res.user.email || "",
      role: res.user.role.toLowerCase(),
    };

    // Store in localStorage - shared across all tabs
    localStorage.setItem(TOKEN_KEY, res.token);
    localStorage.setItem(USER_KEY, JSON.stringify(mappedUser));
    
    setToken(res.token);
    setUser(mappedUser);
    
    
    return mappedUser;
  }, []);

  // Logout - clears localStorage (triggers logout in all tabs via storage event)
  // ATOMIC: Sets flag → stops SignalR → clears state → clears storage → resets flag
  const logout = useCallback(() => {
    // Prevent re-entry during logout
    if (isLoggingOutRef.current) {
      return;
    }
    
    // Set flags FIRST
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    
    
    // CRITICAL: Stop ALL SignalR connections BEFORE clearing auth
    stopAllSignalRConnections();
    
    
    // Clear React state SYNCHRONOUSLY
    setToken(null);
    setUser(null);
    
    // Clear localStorage SYNCHRONOUSLY - triggers storage event in other tabs
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // Clear any cached data
    localStorage.removeItem("categories_cache");
    localStorage.removeItem("products");
    
    
    // Reset flag after a brief delay (to prevent rapid re-login issues)
    setTimeout(() => {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }, 500);
  }, []);

  // Computed auth state - an expired token is not authenticated.
  const isAuthenticated = !!(token && user && !isTokenExpired(token));

  // Check if logged in
  const isLoggedIn = useCallback(() => !!getValidToken(), []);

  return (
    <AuthContext.Provider value={{ 
      user, 
      token, 
      login, 
      logout, 
      isAuthenticated,
      loading,
      isLoggedIn,
      isLoggingOut
    }}>
      {children}
    </AuthContext.Provider>
  );
};

// Hook - MUST use this
export const useAuth = () => useContext(AuthContext);

// Helper to get token from localStorage (for API calls outside React).
// Returns null for an expired token so callers never send a doomed request.
export const getAuthToken = (): string | null => getValidToken();

// Helper to check auth status outside React
export const isAuthenticatedStatic = (): boolean => !!getValidToken();
