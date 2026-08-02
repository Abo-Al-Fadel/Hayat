// src/Pages/HrHome.tsx
/**
 * HR VIEW PICKER
 *
 * HR is the read-only observer: it has no dashboard of its own, it borrows the other
 * three. Landing it straight on /admin (what we did before) hid the other two views
 * entirely - there was no way to reach the pharmacist or storage pages at all.
 *
 * So HR lands here instead and picks which view to open. Every one of them renders in
 * read-only mode; what actually stops HR writing is server-side, in Roles and the
 * reflection test over every controller action. This page only decides where to look.
 *
 * Styled to match Login on purpose: it is the same moment in the flow - the step
 * between signing in and seeing the app - so it should feel like the same page.
 */
import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ShieldCheck, Store, Package, Eye, LogOut } from "lucide-react";
import hayat from "../Images/HL.png";
import "./Login.css";
import { useAuth } from "../Context/AuthContext";

type View = {
  path: string;
  label: string;
  blurb: string;
  Icon: typeof ShieldCheck;
};

/** The three dashboards, in the order they appear on the page. */
const VIEWS: View[] = [
  {
    path: "/admin",
    label: "Admin",
    blurb: "Stock, suppliers, users, orders and statistics",
    Icon: ShieldCheck,
  },
  {
    path: "/pharmacist",
    label: "Pharmacist",
    blurb: "Catalogue, sales counter and invoices",
    Icon: Store,
  },
  {
    path: "/storage",
    label: "Storage Manager",
    blurb: "Supply orders and their delivery status",
    Icon: Package,
  },
];

const HrHome: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const handleSignOut = () => {
    logout();
    navigate("/login", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-loginpage bg-cover bg-center px-4 py-8">
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

        <h1 className="text-3xl font-bold text-white text-center mb-1">
          Choose a view
        </h1>
        <p className="text-white/70 text-center text-sm mb-4">
          {user?.username ? `Signed in as ${user.username}` : "Signed in"}
        </p>

        {/* Said once here rather than as a surprise on each page. */}
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg bg-amber-500/15 border border-amber-400/40 text-amber-100 px-4 py-3 text-sm mb-6"
        >
          <Eye className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <strong className="font-semibold">View-only access.</strong>{" "}
            You can open every page, but not change anything.
          </span>
        </div>

        <nav aria-label="Available views" className="space-y-3">
          {VIEWS.map(({ path, label, blurb, Icon }) => (
            <Link
              key={path}
              to={path}
              className="group flex items-center gap-4 w-full rounded-lg bg-white/10 hover:bg-white/20 border border-white/15 hover:border-white/30 px-4 py-3.5 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#003465] text-white">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-white">{label}</span>
                <span className="block text-xs text-white/60 truncate">{blurb}</span>
              </span>
            </Link>
          ))}
        </nav>

        <button
          onClick={handleSignOut}
          className="mt-6 w-full inline-flex items-center justify-center gap-2 text-white/70 hover:text-white transition-colors text-sm py-2"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </div>
  );
};

export default HrHome;
