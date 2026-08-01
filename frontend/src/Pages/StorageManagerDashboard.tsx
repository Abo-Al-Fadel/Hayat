// src/Pages/StorageManagerDashboard.tsx
/**
 * Storage Manager Dashboard
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Panel for Storage Manager to manage supply stock orders.
 * 
 * Features:
 * - View supply orders assigned by Admin (Ordered → Shipped → Received → Stored)
 * - Update order status with validation (cannot go backward)
 * - Real-time notifications when Admin creates new orders
 * - Light/Dark mode toggle
 * - Notification bell with unread count
 * 
 * Status Flow (Storage Manager can change):
 * - Ordered → Shipped (mark when supplier ships)
 * - Shipped → Received (mark when arrived at pharmacy)
 * - Received → Stored (mark when added to inventory - triggers stock update)
 * 
 * Real-time Sync:
 * - SignalR receives SupplyOrderCreated when Admin creates and orders new supply
 * - SignalR receives SupplyOrderStatusChanged when Admin changes status
 * - Status changes by this user notify Admin in real-time
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { 
  Package, Bell, Sun, Moon, ChevronDown, Check, Truck,
  Clock, AlertCircle, Search, ChevronLeft, ChevronRight, LogOut, Menu, X
} from "lucide-react";
import toast from "react-hot-toast";

// Hooks
import { useSignalR, useDarkMode } from "../hooks";
import { useAuth } from "../Context/AuthContext";

// Services
import {
  getSupplyStocksForStorageManager,
  updateSupplyStockStatus,
  type SupplyStock,
  SupplyStockStatus,
  SUPPLY_STOCK_STATUS_CONFIG,
  getStorageManagerAvailableStatuses,
  canStorageManagerChangeStatus,
  formatDate,
} from "../Services/SupplyOrderService";
import {
  getNotifications,
  markNotificationsRead,
  markAllNotificationsRead,
  type Notification,
} from "../Services/NotificationService";

// Components
import { ConfirmModal } from "../Components/ui";
import logo from "../Images/HL.png";
import { getValidToken } from "../utils/token";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const POLL_INTERVAL = 60000; // 60 seconds fallback poll
const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5057";

// Default fallback image for medicines (purple medical box icon)
const DEFAULT_MEDICINE_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='%239333ea' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M12 8v8M8 12h8'/%3E%3C/svg%3E";

/**
 * Build full image URL from potentially relative path
 * Handles: absolute URLs, data URIs, and relative paths from backend uploads
 * Returns DEFAULT_MEDICINE_IMAGE for empty/null paths
 */
const buildImageUrl = (imagePath: string | undefined | null): string => {
  if (!imagePath || imagePath.trim() === "") {
    return DEFAULT_MEDICINE_IMAGE;
  }
  if (imagePath.startsWith("http") || imagePath.startsWith("data:")) {
    return imagePath;
  }
  return `${API_BASE}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────
interface StatusChangeConfirmation {
  order: SupplyStock;
  newStatus: SupplyStockStatus;
}

// ────────────────────────────────────────────────────────────────────────────
// StorageManagerDashboard Component
// ────────────────────────────────────────────────────────────────────────────
export default function StorageManagerDashboard() {
  const navigate = useNavigate();
  const { darkMode, toggle: toggleDarkMode } = useDarkMode();
  const { logout } = useAuth();

  // ──────────────────────────────────────────────────────────────────────────
  // State
  // ──────────────────────────────────────────────────────────────────────────
  const [supplyOrders, setSupplyOrders] = useState<SupplyStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  // Mobile navigation drawer (ignored from lg up, where the sidebar is static).
  const [navOpen, setNavOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  
  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  
  // Status change confirmation
  const [statusConfirmation, setStatusConfirmation] = useState<StatusChangeConfirmation | null>(null);
  const [statusChanging, setStatusChanging] = useState(false);
  
  // Expanded order details
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  
  // Error tracking
  const shownErrorsRef = useRef<Set<string>>(new Set());
  const didInitRef = useRef(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Data Fetching (defined before SignalR handlers that use them)
  // ──────────────────────────────────────────────────────────────────────────
  const fetchSupplyOrders = useCallback(async () => {
    try {
      const data = await getSupplyStocksForStorageManager();
      setSupplyOrders(data);
    } catch (err) {
      if (!shownErrorsRef.current.has("supplyOrders")) {
        shownErrorsRef.current.add("supplyOrders");
        toast.error("Failed to load supply orders");
      }
      console.error("[StorageManager] Failed to fetch supply orders:", err);
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    try {
      const data = await getNotifications("StorageManager", false);
      setNotifications(data);
      const unread = data.filter(n => !n.isRead).length;
      setUnreadCount(unread);
    } catch (err) {
      console.error("[StorageManager] Failed to fetch notifications:", err);
    }
  }, []);

  // SignalR handlers
  const signalRHandlers = useMemo(() => ({
    ReceiveNotification: (payload: any) => {
      if (payload.type === "supplyorder") {
        toast.success(payload.message || "Supply order updated", { icon: "📦" });
        fetchSupplyOrders();
        fetchNotifications();
      }
    },
    
    // Stock stored event
    StockUpdated: (payload: any) => {
      fetchSupplyOrders();
      const message = payload?.message || `Stock stored: ${payload?.items?.length ?? 0} item(s) added`;
      toast.success(message, { icon: "✅" });
    },
  }), [fetchSupplyOrders, fetchNotifications]);

  // Initialize SignalR connection
  useSignalR("/hubs/notifications", signalRHandlers);

  // ──────────────────────────────────────────────────────────────────────────
  // Initial load and polling
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;

    // getValidToken returns null once expired, so a stale session redirects instead
    // of loading a dashboard whose every request will 401.
    if (!getValidToken()) {
      navigate("/login", { replace: true });
      return;
    }

    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchSupplyOrders(), fetchNotifications()]);
      setLoading(false);
    };

    loadData();

    // Fallback polling (SignalR primary, polling backup)
    const pollInterval = setInterval(() => {
      fetchSupplyOrders();
      fetchNotifications();
    }, POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [navigate, fetchSupplyOrders, fetchNotifications]);

  // ──────────────────────────────────────────────────────────────────────────
  // Filtered & Paginated Data
  // ──────────────────────────────────────────────────────────────────────────
  const filteredOrders = useMemo(() => {
    if (!searchTerm.trim()) return supplyOrders;
    
    const term = searchTerm.toLowerCase();
    return supplyOrders.filter(order => 
      order.supplierName?.toLowerCase().includes(term) ||
      order.items.some(item => item.medicineName.toLowerCase().includes(term)) ||
      order.id.toString().includes(term)
    );
  }, [supplyOrders, searchTerm]);

  const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredOrders.slice(start, start + PAGE_SIZE);
  }, [filteredOrders, currentPage]);

  // Reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  // ──────────────────────────────────────────────────────────────────────────
  // Handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleLogoClick = () => navigate("/");

  const handleLogout = () => {
    logout();
    navigate("/login", { replace: true });
  };

  const handleStatusChangeRequest = (order: SupplyStock, newStatus: SupplyStockStatus) => {
    // Validate the transition
    if (!canStorageManagerChangeStatus(order.status, newStatus)) {
      toast.error(`Cannot change status from ${order.status} to ${newStatus}`);
      return;
    }
    // Show confirmation modal
    setStatusConfirmation({ order, newStatus });
  };

  const confirmStatusChange = async () => {
    if (!statusConfirmation) return;
    
    const { order, newStatus } = statusConfirmation;
    setStatusChanging(true);
    
    try {
      const updated = await updateSupplyStockStatus(order.id, newStatus);
      
      // If status is now Stored, remove from list (inventory updated on backend)
      if (newStatus === SupplyStockStatus.Stored) {
        setSupplyOrders(prev => prev.filter(o => o.id !== order.id));
        toast.success(`Order #${order.id} stored successfully! Inventory updated.`);
      } else {
        setSupplyOrders(prev => prev.map(o => o.id === order.id ? updated : o));
        toast.success(`Order #${order.id} status changed to ${newStatus}`);
      }
      
      setStatusConfirmation(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update status";
      toast.error(message);
    } finally {
      setStatusChanging(false);
    }
  };

  const handleMarkNotificationRead = async (id: number) => {
    try {
      await markNotificationsRead([id]);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      toast.error("Failed to mark all as read");
    }
  };

  const handleNotificationClick = (notification: Notification) => {
    handleMarkNotificationRead(notification.id);
    
    // Navigate to the order if it's a supply order notification
    if (notification.supplyOrderId) {
      const order = supplyOrders.find(o => o.id === notification.supplyOrderId);
      if (order) {
        setExpandedOrderId(order.id);
        setShowNotifications(false);
      }
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Render helpers
  // ──────────────────────────────────────────────────────────────────────────
  const renderStatusBadge = (status: SupplyStockStatus) => {
    const config = SUPPLY_STOCK_STATUS_CONFIG[status];
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color} ${config.darkBgColor}`}>
        {config.label}
      </span>
    );
  };

  const renderStatusDropdown = (order: SupplyStock) => {
    const availableStatuses = getStorageManagerAvailableStatuses(order.status);
    
    // If no available status transitions, just show the badge
    if (availableStatuses.length === 0) {
      return renderStatusBadge(order.status);
    }

    // Current status config for styling
    const currentConfig = SUPPLY_STOCK_STATUS_CONFIG[order.status];

    return (
      <div className="relative inline-block">
        <select
          value={order.status}
          onChange={(e) => {
            const newStatus = e.target.value as SupplyStockStatus;
            if (newStatus !== order.status) {
              handleStatusChangeRequest(order, newStatus);
            }
          }}
          className={`
            appearance-none cursor-pointer px-3 py-1.5 pr-8 text-sm font-medium rounded-lg
            border transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500
            ${darkMode 
              ? "bg-gray-700 border-gray-600 text-gray-200 hover:bg-gray-600" 
              : "bg-white border-gray-300 text-gray-700 hover:bg-gray-50"}
          `}
        >
          {/* Current status as first option */}
          <option value={order.status}>{currentConfig.label}</option>
          {/* Available next statuses */}
          {availableStatuses.map(status => {
            const config = SUPPLY_STOCK_STATUS_CONFIG[status];
            return (
              <option key={status} value={status}>
                {config.label}
              </option>
            );
          })}
        </select>
        <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 pointer-events-none text-gray-400" />
      </div>
    );
  };

  // ──────────────────────────────────────────────────────────────────────────
  // Main Render
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <div className={`min-h-screen flex ${darkMode ? "bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      {/* Backdrop - mobile only */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar - static from lg up, off-canvas drawer below that */}
      <aside
        aria-label="Dashboard navigation"
        className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 shadow-lg p-4 flex flex-col
          transition-transform duration-200 ease-out lg:static lg:z-auto lg:translate-x-0
          ${navOpen ? "translate-x-0" : "-translate-x-full"}
          ${darkMode ? "bg-gray-800" : "bg-white"}`}
      >
        <div className="flex items-center justify-between mb-6">
          <div
            className="flex items-center gap-3 cursor-pointer hover:opacity-80 transition-opacity min-w-0"
            onClick={handleLogoClick}
            title="Go to Homepage"
          >
            <img src={logo} alt="Hayat Logo" className="h-10 w-auto shrink-0" />
            <h2 className={`text-lg font-bold truncate ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
              Storage Manager
            </h2>
          </div>
          <button
            onClick={() => setNavOpen(false)}
            aria-label="Close navigation"
            className="lg:hidden p-1 rounded-md text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-3">
          <button
            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition bg-purple-600 text-white`}
          >
            <Package className="h-5 w-5" />
            Supply Orders
          </button>
        </nav>

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

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <header className={`min-h-16 shadow-md flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-2 ${darkMode ? "bg-gray-800" : "bg-white"}`}>
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setNavOpen(true)}
              aria-label="Open navigation"
              className="lg:hidden p-2 -ml-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <Menu className="h-5 w-5" />
            </button>
            <h1 className={`text-base sm:text-lg font-semibold truncate ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
              Storage Manager Dashboard
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-4 flex-1 justify-end min-w-0">
            {/* Search */}
            <div className="relative flex-1 min-w-0 max-w-md">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search orders..."
                className={`w-full rounded-full px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 ${
                  darkMode ? "bg-gray-700 text-gray-100" : "bg-gray-50 text-gray-700"
                }`}
              />
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${darkMode ? "text-gray-400" : "text-gray-400"}`} />
            </div>

            {/* Notification Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`relative p-2 rounded-full transition ${
                  darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"
                }`}
              >
                <Bell className={`h-5 w-5 ${darkMode ? "text-gray-300" : "text-gray-600"}`} />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center text-xs font-bold text-white bg-red-500 rounded-full">
                    {unreadCount > 99 ? "99+" : unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className={`absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto rounded-lg shadow-xl border z-50 ${
                  darkMode ? "bg-gray-800 border-gray-700" : "bg-white border-gray-200"
                }`}>
                  <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                    <h3 className="font-semibold">Notifications</h3>
                    {unreadCount > 0 && (
                      <button
                        onClick={handleMarkAllRead}
                        className="text-xs text-purple-600 hover:text-purple-700"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  
                  {notifications.length === 0 ? (
                    <div className="p-4 text-center text-gray-500">
                      No notifications
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-200 dark:divide-gray-700">
                      {notifications.slice(0, 10).map(notif => (
                        <div
                          key={notif.id}
                          onClick={() => handleNotificationClick(notif)}
                          className={`p-3 cursor-pointer transition ${
                            notif.isRead 
                              ? (darkMode ? "bg-gray-800" : "bg-white") 
                              : (darkMode ? "bg-gray-700" : "bg-purple-50")
                          } ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}
                        >
                          <p className="text-sm">{notif.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notif.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-full transition ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-200"}`}
            >
              {darkMode ? (
                <Sun className="h-5 w-5 text-yellow-400" />
              ) : (
                <Moon className="h-5 w-5 text-gray-600" />
              )}
            </button>
          </div>
        </header>

        {/* Content Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600"></div>
            </div>
          ) : filteredOrders.length === 0 ? (
            <div className={`text-center py-12 rounded-lg ${darkMode ? "bg-gray-800" : "bg-white"}`}>
              <Truck className={`h-16 w-16 mx-auto mb-4 ${darkMode ? "text-gray-600" : "text-gray-300"}`} />
              <h3 className={`text-lg font-medium ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                {searchTerm ? "No matching orders found" : "No pending supply orders"}
              </h3>
              <p className={`text-sm mt-2 ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                {searchTerm 
                  ? "Try adjusting your search" 
                  : "New orders from Admin will appear here"}
              </p>
            </div>
          ) : (
            <>
              {/* Orders Table */}
              <div className={`rounded-lg shadow overflow-hidden ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                <table className="w-full">
                  <thead className={darkMode ? "bg-gray-700" : "bg-gray-50"}>
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Order #
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Supplier
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Items
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Order Date
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                    {paginatedOrders.map(order => (
                      <React.Fragment key={order.id}>
                        <tr className={`transition ${darkMode ? "hover:bg-gray-700" : "hover:bg-gray-50"}`}>
                          <td className="px-4 py-4 whitespace-nowrap">
                            <span className="font-medium">#{order.id}</span>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {order.supplierName || "Unknown"}
                          </td>
                          <td className="px-4 py-4">
                            <button
                              onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                              className="flex items-center gap-1 text-sm text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
                            >
                              {order.items.length} item(s)
                              <ChevronDown className={`h-4 w-4 transition-transform ${
                                expandedOrderId === order.id ? "rotate-180" : ""
                              }`} />
                            </button>
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap text-sm">
                            {formatDate(order.orderedAt || order.createdAt)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderStatusBadge(order.status)}
                          </td>
                          <td className="px-4 py-4 whitespace-nowrap">
                            {renderStatusDropdown(order)}
                          </td>
                        </tr>
                        
                        {/* Expanded Item Details */}
                        {expandedOrderId === order.id && (
                          <tr>
                            <td colSpan={6} className={`px-4 py-4 ${darkMode ? "bg-gray-750" : "bg-gray-50"}`}>
                              <div className="space-y-2">
                                <h4 className="font-medium text-sm mb-2">Order Items:</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                  {order.items.map((item, idx) => (
                                    <div 
                                      key={idx}
                                      className={`p-3 rounded-lg ${darkMode ? "bg-gray-700" : "bg-white"} border ${
                                        darkMode ? "border-gray-600" : "border-gray-200"
                                      } flex items-center gap-3`}
                                    >
                                      {/* Medicine image */}
                                      <div className="flex-shrink-0 w-14 h-14">
                                        <img
                                          src={buildImageUrl(item.medicineImageUrl)}
                                          alt={item.medicineName}
                                          className="w-full h-full object-cover rounded-lg border-2 border-gray-200 dark:border-gray-600 bg-gray-100 dark:bg-gray-700"
                                          onError={(e) => {
                                            (e.target as HTMLImageElement).src = DEFAULT_MEDICINE_IMAGE;
                                          }}
                                        />
                                      </div>
                                      {/* Medicine details */}
                                      <div className="flex-1 min-w-0">
                                        <p className="font-medium truncate">{item.medicineName}</p>
                                        <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                          Qty: {item.quantity} × ${item.unitPrice.toFixed(2)}
                                        </p>
                                        <p className={`text-sm font-semibold ${darkMode ? "text-purple-400" : "text-purple-600"}`}>
                                          Total: ${(item.quantity * item.unitPrice).toFixed(2)}
                                        </p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                                
                                {/* Status Timeline */}
                                <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-600">
                                  <h4 className="font-medium text-sm mb-2">Status Timeline:</h4>
                                  <div className="flex flex-wrap gap-4 text-xs">
                                    {order.orderedAt && (
                                      <div className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        Ordered: {formatDate(order.orderedAt)}
                                      </div>
                                    )}
                                    {order.shippedAt && (
                                      <div className="flex items-center gap-1">
                                        <Truck className="h-3 w-3" />
                                        Shipped: {formatDate(order.shippedAt)}
                                      </div>
                                    )}
                                    {order.receivedAt && (
                                      <div className="flex items-center gap-1">
                                        <Check className="h-3 w-3" />
                                        Received: {formatDate(order.receivedAt)}
                                      </div>
                                    )}
                                    {order.storedAt && (
                                      <div className="flex items-center gap-1">
                                        <Package className="h-3 w-3" />
                                        Stored: {formatDate(order.storedAt)}
                                      </div>
                                    )}
                                  </div>
                                </div>

                                {order.notes && (
                                  <div className="mt-2 text-sm">
                                    <span className="font-medium">Notes:</span> {order.notes}
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                    Showing {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, filteredOrders.length)} of {filteredOrders.length}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className={`p-2 rounded-lg transition ${
                        darkMode 
                          ? "bg-gray-700 hover:bg-gray-600 disabled:opacity-50" 
                          : "bg-white hover:bg-gray-100 disabled:opacity-50"
                      }`}
                    >
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <span className={`px-4 py-2 rounded-lg ${darkMode ? "bg-gray-700" : "bg-white"}`}>
                      {currentPage} / {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className={`p-2 rounded-lg transition ${
                        darkMode 
                          ? "bg-gray-700 hover:bg-gray-600 disabled:opacity-50" 
                          : "bg-white hover:bg-gray-100 disabled:opacity-50"
                      }`}
                    >
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </main>

      {/* Status Change Confirmation Modal */}
      {statusConfirmation && (
        <ConfirmModal
          isOpen={true}
          title="Confirm Status Change"
          message={
            <span>
              Are you sure you want to change <strong>Order #{statusConfirmation.order.id}</strong> status to{" "}
              <strong>{statusConfirmation.newStatus}</strong>?
              {statusConfirmation.newStatus === SupplyStockStatus.Stored && (
                <span className="block mt-2 text-sm text-amber-600 dark:text-amber-400">
                  <AlertCircle className="inline h-4 w-4 mr-1" />
                  This will add all items to pharmacy inventory!
                </span>
              )}
            </span>
          }
          confirmText="Yes, change status"
          cancelText="No, cancel"
          loading={statusChanging}
          darkMode={darkMode}
          icon={<Truck className={`h-6 w-6 ${darkMode ? "text-purple-400" : "text-purple-600"}`} />}
          onConfirm={confirmStatusChange}
          onCancel={() => setStatusConfirmation(null)}
        />
      )}

      {/* Click outside to close notifications */}
      {showNotifications && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowNotifications(false)}
        />
      )}
    </div>
  );
}
