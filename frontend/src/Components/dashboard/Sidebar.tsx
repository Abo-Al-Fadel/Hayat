// src/Components/dashboard/Sidebar.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { LogOut } from "lucide-react";
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
}

export function Sidebar({ title, items, activePage, onNavigate }: SidebarProps) {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const handleLogoClick = () => {
    navigate("/");
  };

  const handleLogout = () => {
    // 1. Clear auth state and localStorage via AuthContext
    logout();
    // 2. Navigate to login AFTER auth is cleared
    navigate("/login", { replace: true });
  };

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg p-4 flex flex-col">
      <div 
        className="flex items-center gap-3 mb-6 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleLogoClick}
        title="Go to Homepage"
      >
        <img src={logo} alt="Hayat Logo" className="h-10 w-auto" />
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">{title}</h2>
      </div>

      <nav className="flex flex-col gap-3 flex-1">
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onNavigate(item.id)}
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
  );
}
