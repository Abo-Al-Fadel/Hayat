// src/Pages/PharmacistDashboard.tsx
import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../Context/AuthContext";
import logoDark from "../Images/HTL.png";
import logoLight from "../Images/hayatLogo.png";
import * as signalR from "@microsoft/signalr";

import {
  ShoppingCart,
  Search,
  Bell,
  User,
  ClipboardList,
  X,
  Sun,
  Moon,
  Minus,
  Plus,
} from "lucide-react";

import toast, { Toaster } from "react-hot-toast";
import { authorizedFetch, isSessionExpiredError } from "../Services/authorizedFetch";
import {
  OrderCalendar,
  ReadOnlyBanner,
  EMPTY_RANGE,
  isWithinRange,
  type DateRange,
} from "../Components/ui";
import { getValidToken } from "../utils/token";

interface Category {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number; // stock
  categoryId?: number | null;
  isHidden?: boolean;
}

interface CartItem {
  id: number;
  name: string;
  price: number;
  image: string;
  quantity: number; // stock
  cartQuantity: number; // how many in cart
}

interface OrderItem {
  id?: number;
  medicineId: number;
  quantity: number;
  price?: number;
  medicineName?: string;
}

interface CreatedOrder {
  orderId: number;
  total: number;
  invoice?: string;
  createdAt?: string;
  items?: OrderItem[];
}

interface NotificationItem {
  id: string;
  message: string;
  time: string;
  read: boolean;
  serverId?: number | null;
}

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5057";
const POLL_INTERVAL_MS = 60000; // Poll every 60 seconds to reduce spam
const NOTIFICATIONS_ENDPOINT = `${API_BASE}/api/Notifications`;

// Default fallback image for medicines without images
const DEFAULT_MEDICINE_IMAGE = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120' viewBox='0 0 24 24' fill='none' stroke='%239333ea' stroke-width='1.5'%3E%3Crect x='3' y='3' width='18' height='18' rx='2'/%3E%3Cpath d='M12 8v8M8 12h8'/%3E%3C/svg%3E";

/**
 * Build full image URL from potentially relative path
 * Handles: absolute URLs, data URIs, and relative paths from backend uploads
 */
const buildImageUrl = (imagePath: string | undefined | null): string => {
  if (!imagePath) return DEFAULT_MEDICINE_IMAGE;
  // Already absolute URL or data URI - use as-is
  if (imagePath.startsWith("http") || imagePath.startsWith("data:")) {
    return imagePath;
  }
  // Relative path - prefix with API base
  return `${API_BASE}${imagePath.startsWith('/') ? '' : '/'}${imagePath}`;
};

// Page size for pagination
const PAGE_SIZE = 20;

/**
 * Memoized Product Card component to prevent unnecessary re-renders
 * 
 * HOVER EFFECTS:
 * - Scale up slightly (1.02)
 * - BOTTOM-ONLY purple glow in dark mode (original style)
 * - BOTTOM-ONLY gray shadow in light mode
 * - Smooth 300ms transition with upward lift
 */
const ProductCard = React.memo(({ 
  product,
  darkMode,
  mode,
  onAddToCart,
  readOnly = false,
}: {
  product: Product; 
  darkMode: boolean;
  mode: any;
  onAddToCart: (p: Product) => void;
  /** Read-only viewers get the price as a label instead of a button that cannot sell. */
  readOnly?: boolean;
}) => (
  <div 
    className={`
      rounded-2xl shadow-md 
      transition-all duration-300 ease-out
      transform hover:scale-[1.02] hover:-translate-y-1
      ${darkMode 
        ? "bg-gray-900 shadow-gray-900/50 hover:shadow-[0_20px_40px_-15px_rgba(147,51,234,0.5)]" 
        : "bg-white shadow-gray-200/50 hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.15)]"
      }
    `}
  >
    <div className={`relative h-48 sm:h-56 lg:h-64 flex justify-center items-center rounded-t-2xl overflow-hidden ${darkMode ? mode.radialDark : mode.radialLight}`}>
      <div className="flex items-center justify-center h-36 sm:h-44 w-full px-4">
        <img 
          src={buildImageUrl(product.image)} 
          alt={product.name} 
          loading="lazy"
          className="max-h-32 sm:max-h-40 max-w-[120px] sm:max-w-[160px] object-contain relative z-10 drop-shadow-lg transition-transform duration-300 hover:scale-105"
          onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_MEDICINE_IMAGE; }}
        />
      </div>
    </div>

    <div className="p-4 text-center">
      <h3 className={`font-semibold text-base mb-1 ${darkMode ? "text-gray-100" : "text-gray-700"}`}>{product.name}</h3>
      <p className="text-xs mb-2 text-gray-400">In stock: {product.quantity}</p>

      {readOnly ? (
        <div
          className={`w-full px-3 py-1.5 text-sm font-semibold ${
            darkMode ? "text-purple-400" : "text-purple-600"
          }`}
        >
          ${product.price.toFixed(2)}
        </div>
      ) : (
        <button
          onClick={() => onAddToCart(product)}
          disabled={product.quantity === 0}
          aria-label={
            product.quantity === 0
              ? `${product.name} is out of stock`
              : `Add ${product.name} to cart`
          }
          className={`w-full border px-3 py-1.5 rounded-full text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
            product.quantity === 0
              ? "border-gray-400 text-gray-400 cursor-not-allowed"
              : darkMode
              ? "border-purple-400 text-purple-400 hover:bg-purple-500/20 hover:border-purple-300 hover:text-purple-300 hover:shadow-[0_0_10px_rgba(168,85,247,0.3)]"
              : "border-purple-600 text-purple-600 hover:bg-purple-50 hover:border-purple-500 hover:shadow-md"
          }`}
        >
          <ShoppingCart className="h-4 w-4" />
          ${product.price.toFixed(2)}
        </button>
      )}
    </div>
  </div>
));

ProductCard.displayName = 'ProductCard';

const PharmacistDashboard: React.FC = () => {
  const navigate = useNavigate();
  
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null); // null = "All Categories" - SINGLE SELECT
  // Theme persistence - load from localStorage on mount
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem("pharmacistThemeMode");
    return saved ? saved === "dark" : true; // default to dark
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  
  // Categories state - loaded from backend
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(false);

  const [ordersModalOpen, setOrdersModalOpen] = useState(false);
  // Date filter for the orders/invoices list.
  const [ordersDateRange, setOrdersDateRange] = useState<DateRange>(EMPTY_RANGE);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orders, setOrders] = useState<CreatedOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<CreatedOrder | null>(null);

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [lastInvoice, setLastInvoice] = useState<CreatedOrder | null>(null);

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const productsRef = useRef<Product[] | null>(null);

  // Ref to prevent API calls during logout
  const isLoggingOutRef = useRef(false);

  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const startingRef = useRef(false);

  // Auth context for proper logout
  const { logout: authLogout, canEdit } = useAuth();

  // The read-only observer (HR) borrows this page. Selling, and even marking a
  // notification read, are refused for that role server-side - so don't offer them.
  const readOnly = !canEdit;

  // Get token from localStorage. Returns null once expired, so we never fire a
  // request that is guaranteed to 401.
  const getToken = () => getValidToken();

  // Log mount for debugging
  useEffect(() => {
    return () => {
    };
  }, []);

  // merge deduped notifications (new ones first)
  const mergeNotifications = (incoming: NotificationItem[]) => {
    setNotifications((prev) => {
      const map = new Map<string, NotificationItem>();
      for (const n of incoming) map.set(n.id, n);
      for (const n of prev) if (!map.has(n.id)) map.set(n.id, n);
      return Array.from(map.values());
    });
  };

  const markNotificationsReadOnServer = async (serverIds: number[]) => {
    if (!serverIds || serverIds.length === 0) return;
    // Marking read is a write; the server refuses it for the read-only role.
    if (readOnly) return;
    try {
      const token = getToken();
      if (!token) return;
      const res = await authorizedFetch(`${NOTIFICATIONS_ENDPOINT}/markread`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ ids: serverIds }),
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const deleteNotificationOnServer = async (serverId: number) => {
    try {
      const token = getToken();
      if (!token) return false;
      const res = await authorizedFetch(`${NOTIFICATIONS_ENDPOINT}/${serverId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.ok;
    } catch {
      return false;
    }
  };

  const clearNotifications = async () => {
    const serverIds = notifications.map((n) => n.serverId).filter((s): s is number => typeof s === "number");
    if (serverIds.length > 0) {
      const ok = await markNotificationsReadOnServer(serverIds);
      if (!ok) {
        for (const id of serverIds) {
          await deleteNotificationOnServer(id).catch(() => {});
        }
      }
    }
    setNotifications([]);
  };

  const markUnreadAsRead = async () => {
    const unread = notifications.filter((n) => !n.read);
    if (unread.length === 0) return;
    const serverIds = unread.map((n) => n.serverId).filter((s): s is number => typeof s === "number");
    if (serverIds.length > 0) {
      const ok = await markNotificationsReadOnServer(serverIds);
      if (!ok) {
        for (const id of serverIds) {
          await deleteNotificationOnServer(id).catch(() => {});
        }
      }
    }
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const fetchNotifications = async () => {
    try {
      const token = getToken();
      if (!token) return;
      
      const res = await authorizedFetch(NOTIFICATIONS_ENDPOINT, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      
      const data = await res.json();
      const mapped: NotificationItem[] = (data || []).map((n: any, idx: number) => {
        const serverId = n.id ?? n.notificationId ?? null;
        const cid = serverId ? `db-${serverId}` : `db-${Date.now()}-${idx}`;
        return {
          id: cid,
          message: n.message ?? n.text ?? `${n.action ?? "change"} ${n.medicineName ?? ""}`,
          time: n.createdAt ?? n.created_at ?? new Date().toISOString(),
          read: !!n.isRead,
          serverId: serverId ? Number(serverId) : null,
        } as NotificationItem;
      });

      if (mapped.length > 0) {
        mergeNotifications(mapped.reverse());
      }
    } catch (err) {
      console.error("[Pharmacist] Notifications fetch error:", err);
    }
  };

  /**
   * Fetch categories from the backend.
   * GET /api/Categories - requires an authenticated Admin, Pharmacist or StorageManager.
   */
  const fetchCategories = useCallback(async () => {
    try {
      setCategoriesLoading(true);
      const token = getToken();
      const res = await authorizedFetch(`${API_BASE}/api/Categories`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // Previously this returned silently, so an authorization regression showed up
        // as an empty category bar with no clue why.
        console.error(`[Pharmacist] Categories request failed: ${res.status}`);
        toast.error("Could not load categories.");
        return;
      }
      const data = await res.json();
      const mapped: Category[] = (data || []).map((c: any) => ({
        id: c.id,
        name: c.name,
      }));
      setCategories(mapped);
    } catch (err) {
      if (!isSessionExpiredError(err)) {
        console.error("[Pharmacist] Categories request failed:", err);
        toast.error("Could not load categories.");
      }
    } finally {
      setCategoriesLoading(false);
    }
  }, []);

  // Persist theme to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("pharmacistThemeMode", darkMode ? "dark" : "light");
  }, [darkMode]);

  /**
   * Fetch medicines from backend with optional single category filtering and pagination
   * 
   * Endpoints used:
   * - GET /api/Medicine?page=&pageSize= - All medicines with pagination
   * - GET /api/Medicine/by-category/{categoryId} - Filter by single category
   * 
   * IMPORTANT: 
   * - Filters out hidden medicines (isHidden = true)
   * - Supports pagination for performance
   */
  const fetchProducts = useCallback(async (categoryId: number | null = null, page: number = 1, append: boolean = false) => {
    if (isLoggingOutRef.current) return;
    
    try {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoadingProducts(true);
      }
      const token = getToken();
      if (!token) return;

      let url: string;
      if (categoryId === null) {
        // Fetch all medicines with pagination
        url = `${API_BASE}/api/Medicine?page=${page}&pageSize=${PAGE_SIZE}`;
      } else {
        // Fetch by single category
        url = `${API_BASE}/api/Medicine/by-category/${categoryId}`;
      }

      const res = await authorizedFetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      
      if (!res.ok) {
        const txt = await res.text();
        throw new Error(txt || "Failed to fetch products");
      }
      
      const responseData = await res.json();
      // Handle both direct array and { data: [] } response formats
      const data = Array.isArray(responseData) ? responseData : (responseData.data ?? responseData.items ?? responseData);

      // Filter out hidden medicines - Pharmacist should only see visible products
      const formatted: Product[] = (data || [])
        .filter((m: any) => !m.isHidden)
        .map((m: any) => ({
          id: m.id,
          name: m.name,
          price: Number(m.price ?? 0),
          image: m.image ?? "",
          quantity: Number(m.quantity ?? 0),
          categoryId: m.categoryId ?? null,
          isHidden: m.isHidden ?? false,
        }));
      
      if (append) {
        setProducts(prev => [...prev, ...formatted]);
        productsRef.current = [...(productsRef.current ?? []), ...formatted];
      } else {
        setProducts(formatted);
        productsRef.current = formatted;
        setCurrentPage(1);
      }
      
      // Check if there are more items to load
      setHasMore(formatted.length >= PAGE_SIZE);
    } catch (err) {
      // Stay quiet when the session simply ended - the app is already redirecting.
      if (!isLoggingOutRef.current && !isSessionExpiredError(err)) {
        toast.error("Failed loading products.");
      }
    } finally {
      setLoadingProducts(false);
      setLoadingMore(false);
    }
  }, []);

  // Initial data load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        await Promise.all([
          fetchProducts(null, 1, false),
          fetchCategories(),
          fetchNotifications()
        ]);
      } catch (err) {
        console.error("[Pharmacist] Initial data load failed:", err);
      }
    };
    loadInitialData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startConnection = async () => {
    if (connectionRef.current) return;
    if (startingRef.current) return;
    startingRef.current = true;

    const token = getToken();
    if (!token) {
      startingRef.current = false;
      return;
    }

    const conn = new signalR.HubConnectionBuilder()
      .withUrl(`${API_BASE}/hubs/notifications`, {
        accessTokenFactory: () => getToken() ?? "",
        // Use WebSockets with fallback to LongPolling
        transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
      })
      .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
      .configureLogging(signalR.LogLevel.Information)
      .build();

    const onReceive = (payload: any) => {
      try {
        // Skip supply order and stock logistics notifications
        const payloadType = payload?.type?.toLowerCase();
        const action = payload?.action ?? payload?.Action ?? "changed";
        
        if (payloadType === "supplyorder" || action?.includes("supplyorder")) return;
        if (payloadType === "stock" && action === "stockupdated") return;
        
        const message = payload?.message ?? payload?.Message ?? payload?.name ?? `Update: ${action}`;
        const serverId = payload?.id ?? payload?.Id ?? null;
        
        const notif: NotificationItem = {
          id: `${action}-${serverId ?? ""}-${Date.now()}`,
          message,
          time: new Date(payload?.timestamp ?? payload?.createdAt ?? Date.now()).toISOString(),
          read: false,
          serverId: serverId ? Number(serverId) : null,
        };
        
        setNotifications(prev => [notif, ...prev]);
        toast.success(message, { duration: 4000 });
        
        if (action === "created" || action === "updated" || action === "deleted") {
          fetchProducts(selectedCategoryId, 1, false).catch(() => {});
        }
      } catch (err) {
        console.error("[Pharmacist] Notification handling error:", err);
      }
    };

    // StockUpdated - legacy handler for backwards compatibility
    const onStockUpdated = (payload: any) => {
      fetchProducts(selectedCategoryId, 1, false).catch(console.error);
      const message = payload?.message || `Stock updated: ${payload?.items?.length ?? 0} item(s) added`;
      toast.success(message, { icon: "📦", duration: 5000 });
      
      const notif: NotificationItem = {
        id: `stock-${payload?.supplyOrderId ?? ""}-${Date.now()}`,
        message: message,
        time: new Date(payload?.timestamp ?? Date.now()).toISOString(),
        read: false,
        serverId: null,
      };
      setNotifications(prev => [notif, ...prev]);
    };

    // InventoryStockIncreased - stock replenished by StorageManager
    const onInventoryStockIncreased = (payload: any) => {
      const items = payload?.items || [];
      if (items.length > 0) {
        setProducts(prev => prev.map(product => {
          const updated = items.find((item: any) => item.medicineId === product.id);
          if (updated) return { ...product, quantity: updated.newQuantity };
          return product;
        }));
      }
      
      // Show ONE notification per medicine with required format
      // "📦 Stock Updated: {medicineName} +{quantityAdded}"
      items.forEach((item: any) => {
        const message = `📦 Stock Updated: ${item.medicineName} +${item.addedQuantity}`;
        toast.success(message, { duration: 5000 });
        
        // Add to notification bell for persistence
        const notif: NotificationItem = {
          id: `inventory-${item.medicineId}-${Date.now()}`,
          message: message,
          time: new Date(payload?.timestamp ?? Date.now()).toISOString(),
          read: false,
          serverId: null,
        };
        setNotifications(prev => [notif, ...prev]);
      });
    };

    // CategoryChanged - real-time category sync
    // This is the SINGLE SOURCE OF TRUTH for category state changes
    const onCategoryChanged = (payload: any) => {
      const { id, name, action } = payload;
      
      setCategories(prev => {
        switch (action) {
          case "created": {
            // Braces scope the declaration to this case; without them it leaked into
            // the sibling cases at parse time.
            const filtered = prev.filter(c => c.id !== id);
            return [...filtered, { id, name }];
          }
          case "updated":
            return prev.map(c => c.id === id ? { ...c, name } : c);
          case "deleted":
            return prev.filter(c => c.id !== id);
          default:
            return prev;
        }
      });
    };

    // Register handlers
    conn.on("ReceiveNotification", onReceive);
    conn.on("ReceiveMedicineNotification", onReceive);
    conn.on("StockUpdated", onStockUpdated);
    conn.on("InventoryStockIncreased", onInventoryStockIncreased);
    conn.on("CategoryChanged", onCategoryChanged);

    conn.onreconnecting(() => {
      toast.loading("Reconnecting to server...", { id: "signalr-reconnect" });
    });

    conn.onreconnected(() => {
      toast.success("Reconnected!", { id: "signalr-reconnect" });
      fetchNotifications().catch(() => {});
      fetchProducts(selectedCategoryId, 1, false).catch(() => {});
      fetchCategories().catch(() => {});
    });

    conn.onclose(() => {
      connectionRef.current = null;
      startingRef.current = false;
    });

    connectionRef.current = conn;

    const tryStart = async (attempt = 0) => {
      try {
        await conn.start();
        fetchNotifications().catch(() => {});
      } catch (err) {
        console.error("[SignalR] Connection failed, attempt:", attempt, err);
        if (attempt < 6) {
          const delay = Math.min(30000, 1000 * Math.pow(2, attempt));
          setTimeout(() => tryStart(attempt + 1), delay);
        }
      } finally {
        startingRef.current = false;
      }
    };

    tryStart();
  };

  const stopConnection = async () => {
    const conn = connectionRef.current;
    if (!conn) return;
    try {
      conn.off("ReceiveNotification");
      conn.off("ReceiveMedicineNotification");
      conn.off("StockUpdated");
      conn.off("InventoryStockIncreased");
      conn.off("CategoryChanged");
      await conn.stop();
    } catch {
      // ignore
    } finally {
      connectionRef.current = null;
      startingRef.current = false;
    }
  };

  useEffect(() => {
    let mounted = true;
    startConnection().catch(() => {});

    const onStorage = (e: StorageEvent) => {
      if (e.key === "token") {
        (async () => {
          await stopConnection();
          if (!mounted) return;
          setTimeout(() => startConnection().catch(() => {}), 200);
        })();
      }
    };

    const onFocus = () => {
      const token = getToken();
      if (!token) return;
      if (!connectionRef.current) {
        startConnection().catch(() => {});
      }
    };

    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onFocus);

    return () => {
      mounted = false;
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onFocus);
      stopConnection().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll fallback
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const token = getToken();
        if (!token) return;
        const res = await authorizedFetch(`${API_BASE}/api/Medicine`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        const latest: Product[] = (data || []).map((m: any) => ({
          id: m.id,
          name: m.name,
          price: Number(m.price ?? 0),
          image: m.image ?? "",
          quantity: Number(m.quantity ?? 0),
        }));

        const prev = productsRef.current ?? [];
        const prevMap = new Map(prev.map((p) => [p.id, p]));

        const newNotifs: NotificationItem[] = [];

        for (const p of latest) {
          const old = prevMap.get(p.id);
          if (!old) {
            newNotifs.push({
              id: `new-${p.id}-${Date.now()}`,
              message: `New product added: ${p.name}`,
              time: new Date().toISOString(),
              read: false,
            });
          } else {
            if (old.quantity !== p.quantity) {
              newNotifs.push({
                id: `qty-${p.id}-${Date.now()}`,
                message: `Stock changed for ${p.name}: ${old.quantity} → ${p.quantity}`,
                time: new Date().toISOString(),
                read: false,
              });
            } else if (old.price !== p.price) {
              newNotifs.push({
                id: `price-${p.id}-${Date.now()}`,
                message: `Price changed for ${p.name}: $${old.price.toFixed(2)} → $${p.price.toFixed(2)}`,
                time: new Date().toISOString(),
                read: false,
              });
            } else if (old.name !== p.name) {
              newNotifs.push({
                id: `name-${p.id}-${Date.now()}`,
                message: `Name updated: ${old.name} → ${p.name}`,
                time: new Date().toISOString(),
                read: false,
              });
            }
          }
        }

        const latestIds = new Set(latest.map((x) => x.id));
        for (const old of prev) {
          if (!latestIds.has(old.id)) {
            newNotifs.push({
              id: `del-${old.id}-${Date.now()}`,
              message: `Product removed: ${old.name}`,
              time: new Date().toISOString(),
              read: false,
            });
          }
        }

        // Only show notifications for actual changes (debounced by server IDs)
        if (newNotifs.length > 0 && mounted) {
          // Deduplicate by checking if we already have similar recent notifications
          const recentIds = new Set(notifications.slice(0, 10).map(n => n.id.split('-').slice(0, 2).join('-')));
          const trulyNew = newNotifs.filter(n => !recentIds.has(n.id.split('-').slice(0, 2).join('-')));
          if (trulyNew.length > 0) {
            mergeNotifications(trulyNew);
            // Only toast for first notification to avoid spam
            toast(trulyNew[0].message, { duration: 3000 });
          }
        }

        // Update products ref silently (no state update to avoid re-render spam)
        if (mounted) {
          productsRef.current = latest;
        }
      } catch {
        // Silent fail for polling
      }
    };

    const id = setInterval(poll, POLL_INTERVAL_MS);
    // Delay initial poll to not compete with initial load
    const startTimeout = setTimeout(poll, 30000);

    return () => {
      mounted = false;
      clearInterval(id);
      clearTimeout(startTimeout);
    };
  }, [notifications]);

  // Orders & invoices
  const fetchOrders = async () => {
    // Skip if logging out
    if (isLoggingOutRef.current) return;
    
    // Skip if logging out
    if (isLoggingOutRef.current) {
      return;
    }
    
    try {
      setOrdersLoading(true);
      const token = sessionStorage.getItem("token") || localStorage.getItem("token");
      if (!token) {
        return;
      }

      const res = await authorizedFetch(`${API_BASE}/api/Order`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        toast("Orders endpoint not available", { icon: "⚠️" });
        setOrders([]);
        return;
      }

      const data = await res.json();
      const mapped: CreatedOrder[] = (data || []).map((o: any) => ({
        orderId: o.id ?? o.orderId,
        total: Number(o.total ?? o.totalPrice ?? 0),
        createdAt: o.createdAt ?? o.created_at ?? new Date().toISOString(),
        items: o.items?.map((it: any) => ({
          id: it.id,
          medicineId: it.medicineId ?? it.medicine?.id,
          quantity: it.quantity,
          price: it.price,
          medicineName: it.medicine?.name ?? it.medicineName,
        })),
      }));

      setOrders(mapped.reverse());
    } catch (err) {
      if (!isSessionExpiredError(err)) toast.error("Failed to load orders");
    } finally {
      setOrdersLoading(false);
    }
  };

  const openOrdersModal = async () => {
    setOrdersModalOpen(true);
    await fetchOrders();
  };

  const fetchInvoice = async (orderId: number) => {
    // Skip if logging out
    if (isLoggingOutRef.current) {
      return null;
    }
    
    try {
      const token = sessionStorage.getItem("token") || localStorage.getItem("token");
      if (!token) {
        return null;
      }
      const res = await authorizedFetch(`${API_BASE}/api/Order/${orderId}/invoice`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        toast("Invoice not available", { icon: "ℹ️" });
        return null;
      }
      const text = await res.text();
      return text;
    } catch (err) {
      if (!isSessionExpiredError(err)) toast.error("Failed to fetch invoice");
      return null;
    }
  };

  // Cart logic
  /**
   * Filter products by search query only - memoized to prevent recalculation on unrelated state changes
   * Category filtering is handled by backend API calls
   * 
   * Note: Hidden medicines are already filtered out during fetch
   */
  const filteredProducts = useMemo(() => {
    const query = searchQuery.toLowerCase();
    return products.filter((p) => p.name.toLowerCase().includes(query));
  }, [products, searchQuery]);

  /** Orders narrowed to the selected date range. */
  const visibleOrders = useMemo(
    () => orders.filter((o) => isWithinRange(o.createdAt, ordersDateRange)),
    [orders, ordersDateRange]
  );

  /** Markers cover every order, so quiet days stay visible as quiet rather than absent. */
  const orderCalendarItems = useMemo(
    () => orders.map((o) => ({ date: o.createdAt, amount: o.total })),
    [orders]
  );

  /**
   * Handle category selection - SINGLE SELECT ONLY
   * Clicking same category deselects it, clicking different category switches to it
   */
  const handleCategorySelect = async (categoryId: number | null) => {
    // If clicking the same category, deselect (go to All)
    const newCategoryId = categoryId === selectedCategoryId ? null : categoryId;
    setSelectedCategoryId(newCategoryId);
    setCurrentPage(1);
    await fetchProducts(newCategoryId, 1, false);
  };

  /**
   * Load more products for infinite scroll / pagination
   */
  const loadMoreProducts = async () => {
    if (loadingMore || !hasMore) return;
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    await fetchProducts(selectedCategoryId, nextPage, true);
  };

  /**
   * Handle user logout - COMPREHENSIVE FIX
   * 1. Set isLoggingOut flag FIRST to prevent API calls
   * 2. Stop SignalR connection
   * 3. Use AuthContext logout to clear state properly
   * 4. Clear additional storage items
   * 5. Redirect ONCE to login page
   * 
   * Console logging enabled for verification
   */
  const handleLogout = async () => {
    // CRITICAL: Set flag FIRST to prevent any API calls
    if (isLoggingOutRef.current) {
      return;
    }
    isLoggingOutRef.current = true;
    
    
    // 1. Stop SignalR connection first
    try {
      await stopConnection();
    } catch {
      // Ignore errors
    }
    
    // 2. Use AuthContext logout to clear state and sessionStorage
    authLogout();
    
    
    // 3. Navigate to login with replace (ONCE)
    navigate("/login", { replace: true });
  };

  const addToCart = (product: Product) => {
    if (readOnly) return;
    if (product.quantity <= 0) {
      toast.error("Out of stock!");
      return;
    }

    setCart((prev) => {
      const existing = prev.find((it) => it.id === product.id);
      if (existing) {
        if (existing.cartQuantity < product.quantity) {
          return prev.map((it) =>
            it.id === product.id ? { ...it, cartQuantity: it.cartQuantity + 1 } : it
          );
        } else {
          toast.error("No more stock available!");
          return prev;
        }
      }
      return [
        ...prev,
        {
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.image,
          quantity: product.quantity,
          cartQuantity: 1,
        },
      ];
    });
  };

  const updateQuantity = (id: number, quantity: number) => {
    const prod = products.find((p) => p.id === id);
    if (!prod) return;

    if (quantity <= 0) {
      setCart((prev) => prev.filter((it) => it.id !== id));
    } else if (quantity <= prod.quantity) {
      setCart((prev) => prev.map((it) => (it.id === id ? { ...it, cartQuantity: quantity } : it)));
    } else {
      toast.error("Not enough stock!");
    }
  };

  const clearCart = () => {
    setCart([]);
    toast.success("Cart cleared");
  };

  // Memoize cart total to prevent recalculation on unrelated state changes
  const total = useMemo(() => 
    cart.reduce((sum, item) => sum + item.price * item.cartQuantity, 0),
    [cart]
  );

  const handleCheckout = async () => {
    if (readOnly) return;
    // Skip if logging out
    if (isLoggingOutRef.current) {
      return;
    }
    
    if (cart.length === 0) {
      toast.error("Cart is empty.");
      return;
    }
    try {
      const token = sessionStorage.getItem("token") || localStorage.getItem("token");
      if (!token) {
        return;
      }
      setCheckoutLoading(true);

      // Build CheckoutDto matching backend structure
      // OrderItemDto requires: MedicineId, Quantity, PaymentMethod
      const checkoutPayload = {
        items: cart.map((c) => ({
          medicineId: c.id,
          quantity: c.cartQuantity,
          paymentMethod: 0 // Cash = 0 (default payment method enum)
        })),
        totalAmount: total,
        paymentMethod: 0, // Cash = 0 (PaymentMethodEnum)
        orderId: 0, // New order - will be assigned by backend
        notes: null
      };

      const res = await authorizedFetch(`${API_BASE}/api/Order`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(checkoutPayload),
      });

      if (!res.ok) {
        toast.error("Checkout failed. Please try again.");
        return;
      }

      const data = await res.json();

      const created: CreatedOrder = {
        orderId: data.orderId ?? data.id,
        total: Number(data.total ?? total),
        invoice: data.invoice ?? "",
        createdAt: new Date().toISOString(),
      };

      // Clear cart first
      setCart([]);
      
      // Refresh stock list from backend
      await fetchProducts(selectedCategoryId, 1, false);

      // Show invoice
      setLastInvoice(created);
      setInvoiceModalOpen(true);

      if (ordersModalOpen) await fetchOrders();
    } catch (err) {
      if (!isSessionExpiredError(err)) toast.error("Checkout failed. Please try again.");
    } finally {
      setCheckoutLoading(false);
    }
  };

  const copyInvoice = async (invoiceText: string) => {
    try {
      await navigator.clipboard.writeText(invoiceText || `Invoice #${lastInvoice?.orderId}\nTotal: $${lastInvoice?.total}`);
      toast.success("Invoice copied to clipboard");
    } catch {
      toast.error("Copy failed");
    }
  };

  const renderInvoiceLines = (invoiceText: string) =>
    invoiceText.split("\n").map((line, idx) => (
      <div key={idx} className="whitespace-pre-wrap text-sm leading-relaxed">
        {line}
      </div>
    ));

  const mode = darkMode
    ? {
        bg: "bg-gradient-to-br from-gray-900 via-gray-950 to-black text-gray-200",
        navbar: "bg-gray-950/70 border-b border-gray-800",
        input: "bg-gray-800 border-gray-700 placeholder-gray-400 text-gray-200 focus:ring-purple-500",
        cartBg: "bg-gray-900/80 border-gray-800",
        plusMinus: "bg-gray-700 hover:bg-gray-600 text-gray-200",
        qtyInput: "bg-gray-800 border border-gray-700 text-gray-200",
        radialDark: "bg-[radial-gradient(circle_at_center,#2d2d30,#1f1f22,#141416)]",
      }
    : {
        bg: "bg-gray-50 text-gray-700",
        navbar: "bg-white border-b border-gray-200",
        input: "bg-white border border-gray-300 placeholder-gray-500 text-gray-700 focus:ring-purple-400",
        cartBg: "bg-gray-100 border-gray-200",
        plusMinus: "bg-gray-200 hover:bg-gray-300 text-gray-700",
        qtyInput: "bg-white border border-gray-300 text-gray-700",
        radialLight: "bg-[radial-gradient(circle_at_center,#f2f3f4,#e9eaec,#d4d5d6)]",
      };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const toggleNotifOpen = async () => {
    const willOpen = !notifOpen;
    setNotifOpen(willOpen);
    if (willOpen) {
      await markUnreadAsRead();
    }
  };

  return (
    <div className={`flex flex-col min-h-screen ${mode.bg}`}>
      <Toaster position="top-right" />

      {/* NAVBAR */}
      <nav className={`flex items-center justify-between px-6 py-3 shadow-lg backdrop-blur-md ${mode.navbar}`}>
        <div className="flex items-center gap-4">
          {/* Logo - Click to navigate to landing page */}
          <img 
            src={darkMode ? logoDark : logoLight} 
            alt="Logo" 
            className="h-11 w-13 drop-shadow-[0_0_3px_white] cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => navigate("/")}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") navigate("/"); }}
            aria-label="Go to home page"
          />
          <div className="relative">
            <input
              type="text"
              placeholder="Search medicines..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-72 rounded-full px-4 py-2 pl-10 text-sm focus:outline-none focus:ring-2 ${mode.input}`}
            />
            <Search className={`absolute left-3 top-2.5 h-4 w-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`} />
          </div>
        </div>

        <div className="flex items-center gap-4 relative">
          <div
            className="flex items-center gap-2 cursor-pointer hover:text-purple-400 transition select-none"
            onClick={openOrdersModal}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "Enter") openOrdersModal(); }}
            aria-label="Open orders"
          >
            <ClipboardList className="h-5 w-5" />
            <span className="text-sm font-medium">Orders</span>
          </div>

          <button onClick={() => setDarkMode(!darkMode)} className={`p-2 rounded-full transition ${darkMode ? "hover:bg-yellow-600/20" : "hover:bg-gray-300/40"}`} aria-label="Toggle theme">
            {darkMode ? <Sun className="h-5 w-5 text-yellow-400" /> : <Moon className="h-5 w-5 text-gray-700" />}
          </button>

          <div className="relative">
            <button onClick={toggleNotifOpen} className="relative p-2 rounded-full hover:bg-gray-200/20">
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">{unreadCount}</span>}
            </button>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-2 cursor-pointer transition-colors hover:text-red-500"
            title="Click to logout"
          >
            <User className="h-5 w-5" />
            <span className="text-sm font-medium">Pharmacist</span>
          </button>
        </div>
      </nav>

      {/* Fixed notification panel */}
      {notifOpen && (
        <div className={`fixed right-2 sm:right-6 top-16 z-50 w-[calc(100vw-1rem)] max-w-sm sm:w-80 rounded-lg shadow-lg ${darkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}>
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <div className="font-medium">Notifications</div>
            <div className="flex items-center gap-2">
              {!readOnly && (
                <button onClick={clearNotifications} className={`text-sm px-2 py-1 rounded ${darkMode ? "bg-gray-800 hover:bg-gray-700" : "bg-gray-100 hover:bg-gray-200"}`}>Clear</button>
              )}
              <button onClick={() => { setNotifOpen(false); }} className="text-sm px-2 py-1 rounded hover:bg-gray-200/20">Close</button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-3 text-sm text-gray-400">No notifications</div>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={`px-3 py-2 border-b last:border-b-0 ${n.read ? "" : (darkMode ? "bg-purple-900/10" : "bg-purple-50")}`}>
                  <div className="text-sm">{n.message}</div>
                  <div className="text-xs text-gray-400 mt-1">{new Date(n.time).toLocaleString()}</div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Categories - Single select with pill-shaped design */}
      <div className={`px-4 sm:px-6 py-3 flex gap-2 border-b overflow-x-auto ${darkMode ? "border-gray-800" : "border-gray-200"}`}>
        {/* All Categories button */}
        <button
          onClick={() => handleCategorySelect(null)}
          className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
            selectedCategoryId === null
              ? "bg-purple-600 text-white shadow-md shadow-purple-500/30"
              : darkMode
              ? "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white"
              : "bg-white text-gray-700 border border-gray-200 hover:bg-purple-50 hover:text-purple-700"
          }`}
          aria-pressed={selectedCategoryId === null}
        >
          All Categories
        </button>
        
        {/* Dynamic categories - single select */}
        {categoriesLoading ? (
          <div className={`px-5 py-1.5 text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
            Loading categories...
          </div>
        ) : categories.length === 0 ? (
          <div className={`px-5 py-1.5 text-sm ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
            No categories available
          </div>
        ) : (
          categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => handleCategorySelect(cat.id)}
              className={`px-5 py-1.5 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap ${
                selectedCategoryId === cat.id
                  ? "bg-purple-600 text-white shadow-md shadow-purple-500/30"
                  : darkMode
                  ? "bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white"
                  : "bg-white text-gray-700 border border-gray-200 hover:bg-purple-50 hover:text-purple-700"
              }`}
              aria-pressed={selectedCategoryId === cat.id}
            >
              {cat.name}
            </button>
          ))
        )}
      </div>

      {/* Main layout: ensure flex children can shrink so internal scrolling works */}
      <div className="flex flex-col lg:flex-row flex-1 min-h-0 lg:overflow-hidden overflow-y-auto">
        {/* Cart - Fixed height with internal scroll, fits 7+ items before scrolling */}
        {/* Raised position, rounded bottom-right corner only */}
        {/* Dropped entirely for a read-only viewer: a cart that can never check out is
            worse than no cart, and it costs the product grid a third of the width. */}
        {!readOnly && (
        <aside
          className={`order-2 lg:order-1 w-full lg:w-80 shrink-0 p-4 flex flex-col
            lg:max-h-[calc(90vh-45px)] rounded-br-2xl border-t lg:border-t-0 lg:border-r
            ${darkMode ? "bg-gray-900/60 border-gray-800" : "bg-white/80 border-gray-200"}`}
        >
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-lg font-semibold">Cart</h2>
            {cart.length > 0 && (
              <button onClick={clearCart} className="text-red-400 hover:bg-red-900/40 px-2 py-1 rounded-full" title="Clear All Items">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto space-y-2 min-h-0 pr-2">
            {cart.map((item) => (
              <div 
                key={item.id} 
                className={`flex items-center justify-between p-2 rounded-lg shadow ${
                  darkMode ? "bg-gray-800" : "bg-white"
                }`}
              >
                <div className="flex items-center gap-2">
                  <img 
                    src={buildImageUrl(item.image)} 
                    alt={item.name} 
                    loading="lazy"
                    className="h-10 w-10 object-contain rounded"
                    onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_MEDICINE_IMAGE; }}
                  />
                  <div>
                    <p className="font-medium text-sm leading-tight">{item.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">Stock: {item.quantity}</p>
                    <div className="flex items-center gap-1 text-xs mt-0.5">
                      <button onClick={() => updateQuantity(item.id, item.cartQuantity - 1)} className={`p-1 rounded transition-colors duration-150 ${mode.plusMinus}`}>
                        <Minus className="h-3 w-3" />
                      </button>
                      <input
                        type="number"
                        value={item.cartQuantity}
                        onChange={(e) => updateQuantity(item.id, parseInt(e.target.value || "0", 10) || 0)}
                        className={`w-10 rounded text-center text-xs ${mode.qtyInput}`}
                      />
                      <button onClick={() => updateQuantity(item.id, item.cartQuantity + 1)} className={`p-1 rounded transition-colors duration-150 ${mode.plusMinus}`}>
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <p className="font-semibold text-sm text-purple-500">${(item.price * item.cartQuantity).toFixed(2)}</p>
                  <button onClick={() => updateQuantity(item.id, 0)} className="text-red-500 text-xs hover:underline hover:text-red-400 transition-colors">Remove</button>
                </div>
              </div>
            ))}
          </div>

          <div className="border-t pt-3 mt-auto flex-shrink-0">
            <p className="font-semibold flex justify-between text-sm">
              <span>Total</span>
              <span className="text-purple-600">${total.toFixed(2)}</span>
            </p>
            <button 
              onClick={handleCheckout} 
              disabled={checkoutLoading} 
              className={`w-full mt-3 bg-purple-600 text-white py-2 rounded-lg shadow-md shadow-purple-500/30 transition-colors ${
                checkoutLoading ? "opacity-70 cursor-wait" : "hover:bg-purple-700"
              }`}
            >
              {checkoutLoading ? "Processing…" : "Checkout"}
            </button>
          </div>
        </aside>
        )}

        {/* Product Grid - Responsive */}
        <main className="order-1 lg:order-2 flex-1 p-4 sm:p-6 min-h-0 lg:overflow-auto">
          {readOnly && <ReadOnlyBanner darkMode={darkMode} />}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {loadingProducts ? (
              <div className="col-span-full text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-purple-500"></div>
                <p className="mt-2 text-gray-400">Loading products…</p>
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="col-span-full text-center py-8 text-gray-400">
                {selectedCategoryId !== null 
                  ? "No products in this category."
                  : searchQuery
                  ? "No products match your search."
                  : "No products available"}
              </div>
            ) : (
              filteredProducts.map((product) => (
                <ProductCard 
                  key={product.id}
                  product={product}
                  darkMode={darkMode}
                  mode={mode}
                  onAddToCart={addToCart}
                  readOnly={readOnly}
                />
              ))
            )}
          </div>
          
          {/* Load More Button */}
          {!loadingProducts && filteredProducts.length > 0 && hasMore && selectedCategoryId === null && (
            <div className="mt-6 text-center">
              <button
                onClick={loadMoreProducts}
                disabled={loadingMore}
                className={`px-6 py-2 rounded-lg font-medium transition ${
                  darkMode
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700 border border-gray-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
                } ${loadingMore ? "opacity-50 cursor-wait" : ""}`}
              >
                {loadingMore ? "Loading..." : "Load More"}
              </button>
            </div>
          )}
        </main>
      </div>

      {/* Orders modal */}
      {ordersModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOrdersModalOpen(false)} />
          <div className={`relative max-w-6xl w-full max-h-[90vh] overflow-y-auto rounded-lg p-4 sm:p-6 shadow-xl ${darkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-lg font-semibold">Orders &amp; invoices</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { setOrdersModalOpen(false); setSelectedOrder(null); }} className={`${darkMode ? "bg-red-700 hover:bg-red-600 text-white" : "bg-red-100 hover:bg-red-200 text-red-800"} px-3 py-1 rounded`}>Close</button>
              </div>
            </div>

            {/* Calendar, order list and invoice sit side by side from lg up, matching the
                admin panel: pick a day on the left, the list narrows in the middle, the
                invoice opens on the right without anything scrolling out of view.
                Below lg they stack, which is the only thing that fits a phone. */}
            <div className="grid grid-cols-1 lg:grid-cols-[19rem_15rem_minmax(0,1fr)] gap-4 items-start">
              <div className="lg:sticky lg:top-0">
                <OrderCalendar
                  items={orderCalendarItems}
                  value={ordersDateRange}
                  onChange={setOrdersDateRange}
                  darkMode={darkMode}
                  noun="orders"
                  selectedCount={visibleOrders.length}
                />
              </div>

              <div className="lg:border-r lg:pr-3 border-gray-200 dark:border-gray-700">
                {ordersLoading ? (
                  <div className="text-sm text-gray-400">Loading orders…</div>
                ) : visibleOrders.length === 0 ? (
                  <div className="text-sm text-gray-400">
                    {orders.length === 0 ? "No orders found" : "No orders in this date range"}
                  </div>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto pr-2">
                    {visibleOrders.map((o) => {
                      const isSelected = selectedOrder?.orderId === o.orderId;
                      return (
                        <div
                          key={o.orderId}
                          className={`relative p-2 rounded cursor-pointer transition ${isSelected ? (darkMode ? "bg-purple-900/20" : "bg-purple-50") : "hover:bg-gray-100/10"}`}
                          onClick={async () => {
                            setSelectedOrder(o);
                            const inv = await fetchInvoice(o.orderId);
                            if (inv) setSelectedOrder({ ...o, invoice: inv });
                          }}
                        >
                          <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l ${isSelected ? "bg-purple-500" : "bg-transparent"}`} />
                          <div className={`pl-3`}>
                            <div className="flex justify-between items-center">
                              <div>
                                <div className="font-medium">#{o.orderId}</div>
                                <div className="text-xs text-gray-400">{new Date(o.createdAt ?? "").toLocaleString()}</div>
                              </div>
                              <div className="text-right">
                                <div className="font-semibold text-purple-500">${o.total.toFixed(2)}</div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Was a bare w-2/3, which stayed two-thirds wide on a phone. */}
              <div className="min-w-0">
                {selectedOrder ? (
                  <div>
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-semibold">Invoice #{selectedOrder.orderId}</h4>
                        <div className="text-xs text-gray-400">{new Date(selectedOrder.createdAt ?? "").toLocaleString()}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-purple-500">${selectedOrder.total.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className={`mt-4 border rounded-lg p-4 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
                      {selectedOrder.invoice ? (
                        renderInvoiceLines(selectedOrder.invoice)
                      ) : selectedOrder.items && selectedOrder.items.length > 0 ? (
                        <div className="text-sm">
                          {selectedOrder.items.map((it, idx) => (
                            <div key={idx} className="flex justify-between py-1">
                              <div>{it.medicineName ?? `Item ${it.medicineId}`} x {it.quantity}</div>
                              <div>${((it.price ?? 0) * it.quantity).toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs text-gray-400">No invoice text available.</div>
                      )}

                      <div className="mt-4 flex justify-between items-center border-t pt-3">
                        <div className="text-sm font-semibold">Total</div>
                        <div className="text-lg font-bold text-purple-500">${selectedOrder.total.toFixed(2)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex gap-2 justify-end">
                      <button
                        onClick={async () => {
                          const inv = selectedOrder.invoice ?? await fetchInvoice(selectedOrder.orderId) ?? `Invoice #${selectedOrder.orderId}\nTotal: $${selectedOrder.total.toFixed(2)}`;
                          await navigator.clipboard.writeText(inv);
                          toast.success("Invoice copied");
                        }}
                        className={`${darkMode ? "bg-orange-600 hover:bg-orange-500 text-white" : "bg-orange-100 hover:bg-orange-200 text-orange-800"} px-3 py-1 rounded`}
                      >
                        Copy
                      </button>

                      <button
                        onClick={() => window.print()}
                        className={`${darkMode ? "bg-purple-600 hover:bg-purple-500 text-white" : "bg-purple-50 hover:bg-purple-100 text-purple-700"} px-3 py-1 rounded`}
                      >
                        Print
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">Select an order to view the invoice</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoice modal */}
      {invoiceModalOpen && lastInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setInvoiceModalOpen(false)} />
          <div className={`relative max-w-xl w-full rounded-lg p-6 shadow-xl ${darkMode ? "bg-gray-900 text-gray-100" : "bg-white text-gray-900"}`}>
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-xl font-semibold">Invoice #{lastInvoice.orderId}</h3>
                <div className="text-xs text-gray-400">{new Date(lastInvoice.createdAt ?? "").toLocaleString()}</div>
              </div>
              <button
                onClick={() => setInvoiceModalOpen(false)}
                className={`${darkMode ? "text-gray-300 hover:text-gray-100" : "text-gray-600 hover:text-gray-900"} px-2 py-1 rounded`}
              >
                Close
              </button>
            </div>

            <div className={`mt-4 border rounded-lg p-4 ${darkMode ? "bg-gray-800 border-gray-700" : "bg-gray-50 border-gray-200"}`}>
              {lastInvoice.invoice ? (
                renderInvoiceLines(lastInvoice.invoice)
              ) : (
                <>
                  <div className="flex justify-between mb-2">
                    <div className="text-sm">Order ID</div>
                    <div className="text-sm font-medium">#{lastInvoice.orderId}</div>
                  </div>
                  <div className="flex justify-between mb-2">
                    <div className="text-sm">Total</div>
                    <div className="text-sm font-semibold text-purple-500">${lastInvoice.total.toFixed(2)}</div>
                  </div>
                  <div className="text-xs text-gray-400 mt-2">No invoice text returned by server.</div>
                </>
              )}

              <div className="mt-4 flex justify-between items-center border-t pt-3">
                <div className="text-sm font-semibold">Total</div>
                <div className="text-lg font-bold text-purple-500">${lastInvoice.total.toFixed(2)}</div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => copyInvoice(lastInvoice.invoice ?? `Invoice #${lastInvoice.orderId}\nTotal: $${lastInvoice.total.toFixed(2)}`)}
                className={`${darkMode ? "bg-gray-200 text-gray-900 hover:bg-gray-300" : "bg-gray-100 text-gray-800 hover:bg-gray-200"} px-3 py-1 rounded`}
              >
                Copy
              </button>
              <button onClick={() => window.print()} className={`${darkMode ? "bg-purple-600 text-white hover:bg-purple-500" : "bg-purple-600 text-white hover:bg-purple-500"} px-3 py-1 rounded`}>
                Print
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PharmacistDashboard;
