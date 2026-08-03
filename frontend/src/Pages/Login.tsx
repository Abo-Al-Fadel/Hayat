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
import { ArrowLeft, Eye } from "lucide-react";
import hayat from "../Images/HL.png";
import "./Login.css";
import { useAuth } from "../Context/AuthContext";
import { landingPathForRole } from "../utils/roleLanding";
import Spinner from "../Components/Spinner/Spinner";

/**
 * Published demo credentials, shown on this page so a visitor - a recruiter following a
 * CV link, say - can look around without being given a password.
 *
 * Deliberately hard-coded rather than configured. They are compiled into the bundle
 * either way, so anyone can read them out of the JavaScript; putting them behind a
 * deploy-time variable would hide nothing and only means the panel silently vanishes on
 * any host where someone forgot to set it. This way the demo works everywhere the site
 * is deployed, with no per-host setup.
 *
 * What makes publishing them acceptable is the account, not the storage: it holds the
 * read-only HR role, which every write endpoint refuses. DbInitializer hard-codes that
 * role when seeding, and RoleAuthorizationTests walks every action to prove HR appears
 * in no write policy - so this can never become a login that changes anything.
 *
 * The environment variables remain as an override for a fork that wants different
 * credentials, or none: set REACT_APP_DEMO_USER to an empty value to hide the panel.
 */
const DEMO_USERNAME = process.env.REACT_APP_DEMO_USER || "Hr";
const DEMO_PASSWORD = process.env.REACT_APP_DEMO_PASS || "Hr123456!";
const HAS_DEMO_ACCOUNT = Boolean(DEMO_USERNAME && DEMO_PASSWORD);

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
      navigate(landingPathForRole(user.role), { replace: true });
    }
  }, [isAuthenticated, user, authLoading, navigate]);

  /** Shared by the form and the demo button so both behave identically. */
  const signIn = async (name: string, secret: string) => {
    setError("");
    setLoading(true);

    try {
      const loggedUser = await login(name.trim(), secret);

      // Single redirect with replace
      navigate(landingPathForRole(loggedUser.role), { replace: true });
    } catch (err: any) {
      const message = err?.response?.data?.message || err?.response?.data || err?.message || "Login failed";
      console.error("[Login] Login failed:", message);
      setError(typeof message === "string" ? message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await signIn(username, password);
  };

  // Fills the form as well as signing in, so it is obvious what was used and the
  // visitor can repeat it by hand.
  const handleDemoSignIn = async () => {
    setUsername(DEMO_USERNAME);
    setPassword(DEMO_PASSWORD);
    await signIn(DEMO_USERNAME, DEMO_PASSWORD);
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

        {/* Public demo account. Deliberately shows the credentials in plain text: they
            are in the bundle regardless, and a visitor who prefers to type them in
            should be able to. */}
        {HAS_DEMO_ACCOUNT && (
          <div className="mt-6 rounded-lg border border-white/20 bg-white/10 p-4">
            <div className="flex items-start gap-2 text-white/90">
              <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Just looking around?</p>
                <p className="mt-0.5 text-xs text-white/70">
                  Sign in to a view-only account that can open every page but change nothing.
                </p>
              </div>
            </div>

            <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
              <dt className="text-white/60">Username</dt>
              <dd className="font-mono text-white break-all">{DEMO_USERNAME}</dd>
              <dt className="text-white/60">Password</dt>
              <dd className="font-mono text-white break-all">{DEMO_PASSWORD}</dd>
            </dl>

            <button
              type="button"
              onClick={handleDemoSignIn}
              disabled={loading}
              className="mt-3 w-full rounded-lg border border-white/30 bg-white/10 py-2 text-sm font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              Open the read-only demo
            </button>
          </div>
        )}

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

