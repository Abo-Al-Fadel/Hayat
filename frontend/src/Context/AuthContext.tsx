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

// Storage keys - shared across all tabs
const TOKEN_KEY = "token";
const USER_KEY = "user";

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
      
      if (storedToken && storedUser) {
        const parsedUser = JSON.parse(storedUser) as User;
        setToken(storedToken);
        setUser(parsedUser);
        console.log(`[Auth] Token read from localStorage — user: ${parsedUser.username} — role: ${parsedUser.role}`);
      } else {
        console.log("[Auth] No session found in localStorage");
      }
    } catch (err) {
      console.error("[Auth] Failed to parse session, clearing:", err);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
    } finally {
      setLoading(false);
    }
  }, []);

  // Listen for storage changes from other tabs
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === TOKEN_KEY) {
        if (e.newValue === null) {
          // Token was removed (logout from another tab)
          console.log("[Auth] Logout detected from another tab, redirecting to /login");
          setToken(null);
          setUser(null);
          window.location.href = "/login";
        } else if (e.newValue !== token) {
          // Token was changed (login from another tab)
          console.log("[Auth] Token changed from another tab, syncing...");
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
    
    console.log(`[Auth] Login success — role: ${mappedUser.role} — token stored in localStorage`);
    
    return mappedUser;
  }, []);

  // Logout - clears localStorage (triggers logout in all tabs via storage event)
  // ATOMIC: Sets flag → stops SignalR → clears state → clears storage → resets flag
  const logout = useCallback(() => {
    // Prevent re-entry during logout
    if (isLoggingOutRef.current) {
      console.log("[Auth] Logout already in progress, blocking duplicate");
      return;
    }
    
    // Set flags FIRST
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    
    console.log("[Auth] ============================================");
    console.log("[Auth] LOGOUT INITIATED");
    
    // CRITICAL: Stop ALL SignalR connections BEFORE clearing auth
    stopAllSignalRConnections();
    console.log("[Auth] SignalR connections stopped");
    
    console.log("[Auth] token removed");
    
    // Clear React state SYNCHRONOUSLY
    setToken(null);
    setUser(null);
    
    // Clear localStorage SYNCHRONOUSLY - triggers storage event in other tabs
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    
    // Clear any cached data
    localStorage.removeItem("categories_cache");
    localStorage.removeItem("products");
    
    console.log("[Auth] Storage cleared");
    console.log("[Auth] ============================================");
    
    // Reset flag after a brief delay (to prevent rapid re-login issues)
    setTimeout(() => {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }, 500);
  }, []);

  // Computed auth state
  const isAuthenticated = !!(token && user);
  
  // Check if logged in
  const isLoggedIn = useCallback(() => !!(token || localStorage.getItem(TOKEN_KEY)), [token]);

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

// Helper to get token from localStorage (for API calls outside React)
export const getAuthToken = (): string | null => localStorage.getItem(TOKEN_KEY);

// Helper to check auth status outside React
export const isAuthenticatedStatic = (): boolean => !!localStorage.getItem(TOKEN_KEY);
