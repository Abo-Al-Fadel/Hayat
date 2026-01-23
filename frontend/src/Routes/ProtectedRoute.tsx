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

interface Props {
  children: JSX.Element;
  allowedRoles?: string[];
}

// Storage keys - shared across all tabs
const TOKEN_KEY = "token";
const USER_KEY = "user";

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
  const { user, loading } = useAuth();
  const location = useLocation();
  
  // SYNCHRONOUS CHECK - Read directly from localStorage
  // This prevents white screen during AuthContext initialization
  const tokenExists = !!localStorage.getItem(TOKEN_KEY);
  const storageUser = getUserFromStorage();
  
  // Use context user if available, otherwise fall back to localStorage
  const effectiveUser = user || storageUser;
  
  // Show spinner ONLY during AuthContext initial loading
  // AND only if we have a token (meaning user might be valid)
  if (loading && tokenExists) {
    return <Spinner />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 1: No token = Not authenticated → Redirect to /login
  // ─────────────────────────────────────────────────────────────────────────
  if (!tokenExists) {
    console.log(`[ProtectedRoute] No token - redirecting to /login from ${location.pathname}`);
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 2: Token exists but no user data → Redirect to /login
  // ─────────────────────────────────────────────────────────────────────────
  if (!effectiveUser) {
    console.log(`[ProtectedRoute] Token exists but no user data - redirecting to /login from ${location.pathname}`);
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // CHECK 3: Role check (if allowedRoles specified)
  // ─────────────────────────────────────────────────────────────────────────
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = effectiveUser.role?.toLowerCase() || "";
    const allowedLower = allowedRoles.map(r => r.toLowerCase());
    
    if (!allowedLower.includes(userRole)) {
      console.log(`[ProtectedRoute] Role mismatch: '${userRole}' not in [${allowedLower.join(", ")}] - redirecting to /login from ${location.pathname}`);
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
  console.log(`[ProtectedRoute] Access granted to ${location.pathname} for role '${effectiveUser.role}'`);
  return children;
};

export default ProtectedRoute;
