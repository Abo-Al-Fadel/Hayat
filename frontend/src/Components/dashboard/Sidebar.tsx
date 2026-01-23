// src/Components/dashboard/Sidebar.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
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

  const handleLogoClick = () => {
    navigate("/");
  };

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 shadow-lg p-4 flex flex-col">
      <div 
        className="flex items-center gap-3 mb-6 cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleLogoClick}
        title="Go to Homepage"
      >
        <img src={logo} alt="Hayaa Logo" className="h-10 w-auto" />
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-200">{title}</h2>
      </div>

      <nav className="flex flex-col gap-3">
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
    </aside>
  );
}
