// src/Routes/ProtectedRoute.tsx
/**
 * PROTECTED ROUTE - ROLE-BASED ACCESS CONTROL
 * 
 * ZERO WHITE SCREENS GUARANTEED:
 * - Synchronous localStorage check (no async waiting)
 * - Immediate redirect on auth failure
 * - No useEffect delays or timeouts
 * 
 * RULES:
 * - Check token existence in localStorage FIRST (synchronous)
 * - Check role matches allowed roles
 * - Redirect to /login if not authenticated OR wrong role
 * 
 * Console logs:
 * - [ProtectedRoute] No token - redirecting to /login
 * - [ProtectedRoute] Role mismatch: {userRole} not in {allowedRoles}
 * - [ProtectedRoute] Access granted to {path}
 */
import { JSX } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";
import Spinner from "../Components/Spinner/Spinner";
import { TOKEN_KEY, USER_KEY, isTokenExpired, clearSessionStorage } from "../utils/token";

interface Props {
  children: JSX.Element;
  allowedRoles?: string[];
}

/**
 * Get user from localStorage synchronously
 * This ensures we have user data even before AuthContext initializes
 */
const getUserFromStorage = (): { role: string } | null => {
  try {
    const storedUser = localStorage.getItem(USER_KEY);
    if (storedUser) {
      return JSON.parse(storedUser);
    }
  } catch {
    // Invalid JSON in storage
  }
  return null;
};

const ProtectedRoute: React.FC<Props> = ({ children, allowedRoles }) => {
  const { user, loading, isLoggingOut } = useAuth();
  const location = useLocation();
  
  // SYNCHRONOUS CHECK - Read directly from localStorage.
  // The token must be present AND unexpired: treating "a string exists" as signed in
  // let expired sessions into the dashboard, where every API call then 401'd and the
  // page sat empty until the user manually signed out.
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const tokenExists = !!storedToken && !isTokenExpired(storedToken);

  if (storedToken && !tokenExists) {
    // Expired: drop the stale session so the login page starts clean.
    clearSessionStorage();
  }

  const storageUser = tokenExists ? getUserFromStorage() : null;
  
  // Use context user if available, otherwise fall back to localStorage
  const effectiveUser = user || storageUser;
  
  // During logout, immediately redirect to prevent white screen
  // This catches the case where logout was triggered but navigate hasn't happened yet
  if (isLoggingOut) {
    return <Navigate to="/login" replace />;
  }
  
  // Show spinner ONLY during AuthContext initial loading
  // AND only if we have a token (meaning user might be valid)
  if (loading && tokenExists) {
    return <Spinner />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 1: No token = Not authenticated → Redirect to /login
  // ─────────────────────────────────────────────────────────────────────────
  if (!tokenExists) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 2: Token exists but no user data → Redirect to /login
  // ─────────────────────────────────────────────────────────────────────────
  if (!effectiveUser) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 3: Role check (if allowedRoles specified)
  // ─────────────────────────────────────────────────────────────────────────
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = effectiveUser.role?.toLowerCase() || "";
    const allowedLower = allowedRoles.map(r => r.toLowerCase());
    
    if (!allowedLower.includes(userRole)) {
      return (
        <Navigate 
          to="/login" 
          replace 
          state={{ 
            unauthorized: true, 
            message: `Access denied. This page requires ${allowedRoles.join(" or ")} role.`,
            from: location 
          }} 
        />
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ALL CHECKS PASSED → Render children
  // ─────────────────────────────────────────────────────────────────────────
  return children;
};

export default ProtectedRoute;
