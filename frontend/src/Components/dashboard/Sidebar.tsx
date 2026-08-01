// src/Components/dashboard/Sidebar.tsx
import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, X } from "lucide-react";
import { useAuth } from "../../Context/AuthContext";
import logo from "../../Images/HL.png";

export interface NavItem {
  id: string;
  label: string;
  icon: React.ReactNode;
}

interface SidebarProps {
  title: string;
  items: NavItem[];
  activePage: string;
  onNavigate: (pageId: string) => void;
  /** Mobile drawer state. Ignored from `lg` up, where the sidebar is always visible. */
  isOpen?: boolean;
  onClose?: () => void;
}

/**
 * Dashboard navigation.
 *
 * From `lg` up this is a static 16rem column. Below that it becomes an off-canvas
 * drawer: a fixed 256px sidebar previously consumed most of a phone screen and left
 * the actual content unusable.
 */
export function Sidebar({
  title,
  items,
  activePage,
  onNavigate,
  isOpen = false,
  onClose,
}: SidebarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogoClick = () => navigate("/");

  const handleLogout = () => {
    // 1. Clear auth state and localStorage via AuthContext
    logout();
    // 2. Navigate to login AFTER auth is cleared
    navigate("/login", { replace: true });
  };

  const handleNavigate = (pageId: string) => {
    onNavigate(pageId);
    // Close the drawer after choosing a destination on mobile.
    onClose?.();
  };

  // Escape closes the drawer, and body scroll is locked while it covers the page.
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose?.();
    };
    window.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen, onClose]);

  return (
    <>
      {/* Backdrop - mobile only */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={`
          fixed inset-y-0 left-0 z-50 w-64 shrink-0 bg-white dark:bg-gray-800 shadow-lg p-4
          flex flex-col transition-transform duration-200 ease-out
          lg:static lg:z-auto lg:translate-x-0
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
        `}
        aria-label="Dashboard navigation"
      >
        <div className="flex items-center justify-between mb-6">
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
            onClick={handleLogoClick}
            title="Go to Homepage"
          >
            <img src={logo} alt="Hayat Logo" className="h-10 w-auto shrink-0" />
            <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200 truncate">{title}</h2>
          </div>

          {/* Close control - mobile only */}
          <button
            onClick={onClose}
            aria-label="Close navigation"
            className="lg:hidden p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-3 flex-1 overflow-y-auto">
          {items.map((item) => (
            <button
              key={item.id}
              onClick={() => handleNavigate(item.id)}
              aria-current={activePage === item.id ? "page" : undefined}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition ${
                activePage === item.id
                  ? "bg-purple-600 text-white"
                  : "text-gray-700 dark:text-gray-300 hover:bg-purple-100 dark:hover:bg-gray-700"
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sign Out Button at Bottom */}
        <div className="mt-auto pt-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm rounded-lg transition text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-gray-700"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>
    </>
  );
}
