// src/Components/PublicHeader.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { FaSignOutAlt, FaUserCircle as FaUserCircleRaw } from "react-icons/fa";
import { useAuth } from "../Context/AuthContext";
import { landingPathForRole } from "../utils/roleLanding";
import hayat from "../Images/HTL.png";

export const FaUserCircle = (props: React.SVGProps<SVGSVGElement>) => FaUserCircleRaw(props);

interface PublicHeaderProps {
  /**
   * Highlights the nav entry for the page being viewed.
   *
   * Only "contact" is a public page. "Products" leads into a role dashboard, so it is
   * never the current public route - marking it active on the home page made it look
   * as though you were already on a products page.
   */
  active?: "contact";
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
  //
  // Shares landingPathForRole with the login page and the homepage. This was the fourth
  // hand-written copy of that mapping and, like the homepage's, it had no case for HR -
  // so the button navigated to "/" and did nothing at all for that role.
  const goToApp = () => {
    if (!user) {
      navigate("/login", { state: { redirectTo: true } });
      return;
    }
    navigate(landingPathForRole(user.role));
  };

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  // Tighter below md so the logo, both nav entries and the profile control fit on one
  // row on a phone - at the md sizing they need ~313px of a 320px screen, which is the
  // kind of margin that survives a screenshot and nothing else. md up is unchanged.
  const navButton = (isActive: boolean) =>
    `px-3 py-1.5 text-xs md:px-5 md:py-2 md:text-sm whitespace-nowrap rounded-full transition-colors ${
      isActive ? "bg-[#00274d] ring-2 ring-white/40" : "bg-[#003465] hover:bg-blue-900"
    }`;

  return (
    <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 md:gap-3 py-4 sm:py-6">
      {/* Logo + name. Stacked below md so the mark reads as a badge rather than a
          strip of header, side by side from md up as before. */}
      <button
        onClick={() => navigate("/")}
        className="flex flex-col md:flex-row items-center gap-1 md:gap-3 pl-0 md:pl-8 min-w-0"
        aria-label="Hayat home"
      >
        <img src={hayat} alt="Hayat" className="h-10 w-10 object-contain" />
        {/* .wordmark carries the face, tracking, shadow and nudge - see index.css. It
            has to be a class rather than the inline styles this used to have, because
            inline styles cannot answer a media query. */}
        <span className="wordmark text-[1.15rem] md:text-[1.75rem] text-white">Hayat</span>
      </button>

      {/* Centre nav. In flow on a phone, where the header's justify-between is what puts
          it between the logo and the profile control on a single row; taken out of flow
          and absolutely centred from md up, as before. */}
      <nav className="flex gap-2 md:gap-3 md:absolute md:left-1/2 md:-translate-x-1/2 md:top-8">
        {/* Never marked active: it leads into a dashboard, not a public page. */}
        <button className={navButton(false)} onClick={goToApp}>
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
