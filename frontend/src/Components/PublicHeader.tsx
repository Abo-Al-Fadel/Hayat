// src/Components/PublicHeader.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { FaSignOutAlt, FaUserCircle as FaUserCircleRaw } from "react-icons/fa";
import { useAuth } from "../Context/AuthContext";
import hayat from "../Images/HTL.png";

export const FaUserCircle = (props: React.SVGProps<SVGSVGElement>) => FaUserCircleRaw(props);

interface PublicHeaderProps {
  /** Highlights the current destination in the nav. */
  active?: "products" | "contact";
}

/**
 * Shared header for the public pages (Home, Contact) so the nav, branding and
 * sign-in/out control stay identical between them.
 */
export function PublicHeader({ active }: PublicHeaderProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  // "Products" means "take me into the app": to the right dashboard when signed in,
  // otherwise to sign-in first.
  const goToApp = () => {
    if (!user) {
      navigate("/login", { state: { redirectTo: true } });
      return;
    }
    const role = user.role?.toLowerCase();
    if (role === "admin") navigate("/admin");
    else if (role === "pharmacist") navigate("/pharmacist");
    else if (role === "storagemanager") navigate("/storage");
    else navigate("/");
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const navButton = (isActive: boolean) =>
    `px-5 py-2 rounded-full text-sm transition-colors ${
      isActive ? "bg-[#00274d] ring-2 ring-white/40" : "bg-[#003465] hover:bg-blue-900"
    }`;

  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 py-4 sm:py-6">
      {/* Logo + name */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-3 pl-0 md:pl-8 min-w-0"
        aria-label="Hayat home"
      >
        <img src={hayat} alt="Hayat" className="h-10 w-10 object-contain" />
        <span
          className="exported-logo"
          style={{
            fontFamily: "Winslowtitle Boldnarrow",
            fontSize: "1.75rem",
            color: "white",
            textShadow: "2px 1px 2px rgba(255, 255, 255, 0.31)",
            transform: "translateY(4px)",
          }}
        >
          Hayat
        </span>
      </button>

      {/* Centre nav - in flow on mobile, absolutely centred from md up */}
      <nav className="order-3 w-full flex justify-center gap-3 md:order-none md:w-auto md:absolute md:left-1/2 md:-translate-x-1/2 md:top-8">
        <button className={navButton(active === "products")} onClick={goToApp}>
          Products
        </button>
        <button className={navButton(active === "contact")} onClick={() => navigate("/contact")}>
          Contact
        </button>
      </nav>

      {/* Profile / sign out */}
      <div className="pr-0 md:pr-8">
        {!user ? (
          <button onClick={() => navigate("/login")} aria-label="Sign in">
            {FaUserCircle({
              className:
                "h-8 w-8 text-[#003465] bg-white rounded-full p1 hover:text-[#00274d]",
            })}
          </button>
        ) : (
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 bg-[#003465] hover:bg-[#00274d] px-3 py-1 rounded-md"
          >
            {FaSignOutAlt({ className: "h-6 w-6 text-white/90 " })}
            <span className="text-sm">Logout</span>
          </button>
        )}
      </div>
    </header>
  );
}
