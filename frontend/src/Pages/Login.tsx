// src/Pages/Login.tsx
/**
 * LOGIN PAGE - SHARED SESSION
 * 
 * RULES:
 * - Token stored in localStorage (shared across all tabs)
 * - Single redirect AFTER successful login
 * - Show unauthorized message if redirected from protected route
 * - Log all auth events
 */
import React, { useState, useRef, useEffect } from "react";
import { useNavigate, useLocation, Link, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import hayat from "../Images/HL.png";
import "./Login.css";
import { useAuth } from "../Context/AuthContext";
import Spinner from "../Components/Spinner/Spinner";

const Login: React.FC = () => {
  const { login, isAuthenticated, user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  // Anti-loop protection
  const hasRedirectedRef = useRef(false);

  const [searchParams] = useSearchParams();

  // Set by the session-expiry handler when it bounces the user here.
  const sessionExpired = searchParams.get("reason") === "expired";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Check for unauthorized message from ProtectedRoute redirect
  const unauthorizedMessage = (location.state as any)?.message || 
    ((location.state as any)?.unauthorized ? "You don't have permission to access that page." : "");

  // Clear unauthorized state after showing
  useEffect(() => {
    if (unauthorizedMessage) {
      // Clear the state after a delay so back button doesn't show message again
      const timer = setTimeout(() => {
        window.history.replaceState({}, document.title);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [unauthorizedMessage]);

  // Redirect if already authenticated - ONCE only, with ref protection
  useEffect(() => {
    if (authLoading) return; // Wait for auth to initialize
    
    if (isAuthenticated && user && !hasRedirectedRef.current) {
      hasRedirectedRef.current = true;
      const role = user.role.toLowerCase();
      
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "pharmacist") navigate("/pharmacist", { replace: true });
      else if (role === "storagemanager" || role === "storage manager") navigate("/storage", { replace: true });
      else navigate("/", { replace: true });
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const loggedUser = await login(username.trim(), password);
      const role = loggedUser.role.toLowerCase();
      

      // Single redirect with replace
      if (role === "admin") navigate("/admin", { replace: true });
      else if (role === "pharmacist") navigate("/pharmacist", { replace: true });
      else if (role === "storagemanager" || role === "storage manager") navigate("/storage", { replace: true });
      else navigate("/", { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data || err?.message || "Login failed";
      console.error("[Login] Login failed:", message);
      setError(typeof message === "string" ? message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  // Show spinner during initial auth check
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-loginpage bg-cover bg-center">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-loginpage bg-cover bg-center">
      <div className="bg-white/5 backdrop-blur-md shadow-xl rounded-xl w-full max-w-md p-6 sm:p-10">
        <Link
          to="/"
          aria-label="Back to home"
          className="inline-flex items-center gap-1.5 text-white/70 hover:text-white transition-colors text-sm mb-4 -ml-1"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to home
        </Link>

        <div className="flex justify-center mb-6">
          <img src={hayat} alt="Hayat" className="h-16 w-16 sm:h-20 sm:w-20 object-contain" />
        </div>

        <h2 className="text-3xl font-bold text-white text-center mb-6">Sign In</h2>

        {/* The previous session ran out rather than the user signing out */}
        {sessionExpired && !unauthorizedMessage && (
          <div className="bg-blue-500/20 border border-blue-400 text-blue-100 px-4 py-3 rounded-lg mb-4 text-center text-sm">
            Your session expired. Please sign in again.
          </div>
        )}

        {/* Show unauthorized access warning */}
        {unauthorizedMessage && (
          <div className="bg-yellow-500/20 border border-yellow-400 text-yellow-200 px-4 py-3 rounded-lg mb-4 text-center text-sm">
            {unauthorizedMessage}
          </div>
        )}

        {error && <p className="text-red-400 text-center mb-4">{error}</p>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-white/80 mb-1">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              className="w-full px-4 py-3 rounded-lg bg-white/30 placeholder-white text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-white/80 mb-1">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-3 rounded-lg bg-white/30 placeholder-white text-white focus:ring-2 focus:ring-blue-500 focus:outline-none"
              required
            />
          </div>

          <button
            type="submit"
            className="w-full bg-[#003465] hover:bg-[#00274d] text-white py-3 rounded-lg font-bold transition-colors flex items-center justify-center"
            disabled={loading}
          >
            {loading ? <Spinner className="w-5 h-5" /> : "Sign In"}
          </button>
        </form>

        {/* Password reset is not implemented (no /forgot-password route and no
            server endpoint), so we tell users what to do instead of linking to a
            dead page. Restore a link here once the flow exists. */}
        <div className="mt-4 text-center text-white/70 text-sm">
          Forgot your password? Ask an administrator to reset it.
        </div>
      </div>
    </div>
  );
};

export default Login;

