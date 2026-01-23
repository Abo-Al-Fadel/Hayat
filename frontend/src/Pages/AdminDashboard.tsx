// src/Pages/AdminDashboard.tsx
/**
 * Admin Dashboard - Main management interface
 * 
 * Features:
 * - Products management with categories
 * - Orders viewing
 * - Supply stocks management
 * - Users management
 * 
 * Section Persistence:
 * - Uses localStorage to persist active section across page reloads
 * - Key: "adminDashboardActiveSection"
 * - Valid values: "products" | "orders" | "stocks" | "users"
 * 
 * Low Stock Logic:
 * - Products with stock < 30 are considered "low stock"
 * - Displayed only in Products section (removed from other areas)
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Package, FileText, Eye, EyeOff, Truck, Users, X, Plus, Trash2, Edit2, FolderOpen, AlertTriangle } from "lucide-react";
import toast from "react-hot-toast";

// Hooks
import {
  useSignalR,
  useProducts,
  useOrders,
  useDarkMode,
  useConfirmModal,
  useCategories,
} from "../hooks";

// Components
import { StatCard, ConfirmModal } from "../Components/ui";
import {
  Sidebar,
  DashboardHeader,
  ProductCard,
  NewProductForm,
  OrderListItem,
  InvoiceModal,
  SupplyStockPanel,
  SupplierPanel,
  type NavItem,
} from "../Components/dashboard";

// Services
import { buildMedicineChangePayload } from "../Services/NotificationService";
import { getUsers, createUser, deleteUser, updateUserRole, type User, type CreateUserDto } from "../Services/UserService";
import { getSuppliers, createSupplier, deleteSupplier, type Supplier } from "../Services/SupplierService";
import { 
  getSupplyStocks, 
  createSupplyStock, 
  updateSupplyStockStatus,
  type SupplyStock,
  type CreateSupplyStockDto,
  SupplyStockStatus,
} from "../Services/SupplyOrderService";

// ────────────────────────────────────────────────────────────────────────────
// Constants
// ────────────────────────────────────────────────────────────────────────────
const NAV_ITEMS: NavItem[] = [
  { id: "products", label: "Products", icon: <Package className="h-5 w-5" /> },
  { id: "orders", label: "Orders", icon: <FileText className="h-5 w-5" /> },
  { id: "stocks", label: "Stocks", icon: <Truck className="h-5 w-5" /> },
  { id: "users", label: "Users", icon: <Users className="h-5 w-5" /> },
];

type PageType = "products" | "orders" | "stocks" | "users";

// LocalStorage key for section persistence
const ACTIVE_SECTION_STORAGE_KEY = "adminDashboardActiveSection";

// Low stock threshold - products below this count are considered low stock
const LOW_STOCK_THRESHOLD = 30;

/**
 * Get persisted active section from localStorage
 * Returns "products" as default if not found or invalid
 */
const getPersistedSection = (): PageType => {
  try {
    const stored = localStorage.getItem(ACTIVE_SECTION_STORAGE_KEY);
    if (stored && ["products", "orders", "stocks", "users"].includes(stored)) {
      return stored as PageType;
    }
  } catch {
    // localStorage might be unavailable
  }
  return "products";
};

/**
 * Persist active section to localStorage
 */
const persistSection = (section: PageType): void => {
  try {
    localStorage.setItem(ACTIVE_SECTION_STORAGE_KEY, section);
  } catch {
    // localStorage might be unavailable
  }
};

// ────────────────────────────────────────────────────────────────────────────
// AdminDashboard
// ────────────────────────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const navigate = useNavigate();
  const { darkMode, toggle: toggleDarkMode } = useDarkMode();

  // Active section - initialized from localStorage for persistence
  const [activePage, setActivePage] = useState<PageType>(getPersistedSection);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterHidden, setFilterHidden] = useState<"all" | "visible" | "hidden">("all");
  
  // Search states for Orders and Users pages
  const [ordersSearchTerm, setOrdersSearchTerm] = useState("");
  const [usersSearchTerm, setUsersSearchTerm] = useState("");
  
  // ──────────────────────────────────────────────────────────────────────────
  // Multi-Category Filter State
  // Uses Set<number> for efficient O(1) lookup when filtering
  // Empty set means "All Categories" - no filtering applied
  // ──────────────────────────────────────────────────────────────────────────
  const [selectedCategories, setSelectedCategories] = useState<Set<number>>(new Set());
  
  // Guard to show error toasts only once
  const shownErrorsRef = useRef<Set<string>>(new Set());

  // ──────────────────────────────────────────────────────────────────────────
  // Category Delete Confirmation Modal State
  // Custom modal for category deletion with clear warnings
  // ──────────────────────────────────────────────────────────────────────────
  const [categoryToDelete, setCategoryToDelete] = useState<{ id: number; name: string } | null>(null);
  const [categoryDeleting, setCategoryDeleting] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Category Management Modal State
  // ──────────────────────────────────────────────────────────────────────────
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<{ id: number; name: string } | null>(null);
  const [categoryName, setCategoryName] = useState("");
  const [categorySaving, setCategorySaving] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // Users State
  // ──────────────────────────────────────────────────────────────────────────
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUserForm, setShowAddUserForm] = useState(false);
  const [newUserForm, setNewUserForm] = useState<CreateUserDto>({
    userName: "",
    password: "",
    email: "",
    role: "Pharmacist",
  });
  const [userSaving, setUserSaving] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // User Delete Confirmation Modal State
  // Custom modal for user deletion - NOT using generic ConfirmModal
  // ──────────────────────────────────────────────────────────────────────────
  const [userToDelete, setUserToDelete] = useState<User | null>(null);
  const [userDeleting, setUserDeleting] = useState(false);

  // ──────────────────────────────────────────────────────────────────────────
  // User Role Editing State
  // Tracks which user is currently being edited and loading state
  // ──────────────────────────────────────────────────────────────────────────
  const [roleUpdating, setRoleUpdating] = useState<string | null>(null); // userId being updated

  // ──────────────────────────────────────────────────────────────────────────
  // Stocks State
  // ──────────────────────────────────────────────────────────────────────────
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [suppliersLoading, setSuppliersLoading] = useState(false);
  const [supplyStocks, setSupplyStocks] = useState<SupplyStock[]>([]);
  const [supplyStocksLoading, setSupplyStocksLoading] = useState(false);

  // Products - must be before SignalR so reloadProducts is available
  const {
    products,
    loading: productsLoading,
    error: productsError,
    isDirty,
    saving,
    reload: reloadProducts,
    undo: undoChanges,
    updateLocalProduct,
    saveAll,
    toggleHidden,
    createProduct,
    removeProduct,
    updateProductImage,
  } = useProducts();

  // Categories - includes CRUD operations
  const { categories, addCategory, editCategory, removeCategory, reload: reloadCategories } = useCategories();

  // Orders - must be before SignalR so reloadOrders is available
  const {
    orders,
    loading: ordersLoading,
    error: ordersError,
    selectedOrder,
    fetchOrders,
    fetchOrderDetail,
    closeOrderDetail,
    reload: reloadOrders,
  } = useOrders();

  // SignalR - handlers for receiving notifications from other roles
  // Admin receives notifications when Pharmacists make changes (if applicable)
  const signalRHandlers = useMemo(() => ({
    // Listen for the correct event name from backend
    ReceiveNotification: (payload: any) => {
      console.log("[Admin] Notification received:", payload);
      // Reload products when notified of changes
      reloadProducts();
      // Also reload orders in case it's an order notification
      if (payload?.action === "ordercreated" || payload?.type === "order") {
        reloadOrders();
      }
    },
    // Order created - reload orders list
    OrderCreated: () => {
      console.log("[Admin] OrderCreated received - reloading orders");
      reloadOrders();
    },
    // Legacy event names for backwards compatibility
    MedicineCreated: () => reloadProducts(),
    MedicineUpdated: () => reloadProducts(),
    MedicineDeleted: () => reloadProducts(),
  }), [reloadProducts, reloadOrders]);
  
  const { invoke } = useSignalR("/hubs/notifications", signalRHandlers);

  // Confirm Modal
  const { isOpen: confirmOpen, target: confirmTarget, targetName: confirmName, loading: confirmLoading, open: openConfirm, close: closeConfirm, setLoading: setConfirmLoading } = useConfirmModal<number>();

  // ──────────────────────────────────────────────────────────────────────────
  // Section Persistence - persist active section to localStorage on change
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    persistSection(activePage);
  }, [activePage]);

  // ──────────────────────────────────────────────────────────────────────────
  // Initial fetch - runs ONCE on mount
  // ──────────────────────────────────────────────────────────────────────────
  const didInitRef = useRef(false);
  
  useEffect(() => {
    // StrictMode guard - only run once
    if (didInitRef.current) return;
    didInitRef.current = true;
    
    // Check token from localStorage (shared across all tabs)
    const TOKEN_KEY = "token";
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      console.log("[Admin] No token in localStorage, redirecting to /login");
      navigate("/login", { replace: true });
      return;
    }
    
    console.log("[Admin] Dashboard mounted with valid token");
  }, [navigate]);

  // ──────────────────────────────────────────────────────────────────────────
  // Fetch Users when users page is active
  // ──────────────────────────────────────────────────────────────────────────
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const data = await getUsers();
      setUsers(data);
    } catch (err) {
      if (!shownErrorsRef.current.has("users")) {
        shownErrorsRef.current.add("users");
        toast.error("Failed to load users");
      }
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activePage === "users") {
      fetchUsers();
    }
  }, [activePage, fetchUsers]);

  // ──────────────────────────────────────────────────────────────────────────
  // Fetch Orders when orders page is active
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (activePage === "orders") {
      fetchOrders();
    }
  }, [activePage, fetchOrders]);

  // ──────────────────────────────────────────────────────────────────────────
  // Fetch Stocks data when stocks page is active
  // ──────────────────────────────────────────────────────────────────────────
  const fetchStocksData = useCallback(async () => {
    // Fetch suppliers
    setSuppliersLoading(true);
    try {
      const data = await getSuppliers();
      setSuppliers(data);
    } catch (err) {
      if (!shownErrorsRef.current.has("suppliers")) {
        shownErrorsRef.current.add("suppliers");
        toast.error("Failed to load suppliers");
      }
    } finally {
      setSuppliersLoading(false);
    }

    // Fetch supply stocks
    setSupplyStocksLoading(true);
    try {
      const data = await getSupplyStocks();
      setSupplyStocks(data);
    } catch (err) {
      if (!shownErrorsRef.current.has("supplyStocks")) {
        shownErrorsRef.current.add("supplyStocks");
        toast.error("Failed to load supply stocks");
      }
    } finally {
      setSupplyStocksLoading(false);
    }
    // NOTE: Low stock items now shown in Products section, not fetched separately here
  }, []);

  useEffect(() => {
    if (activePage === "stocks") {
      fetchStocksData();
    }
  }, [activePage, fetchStocksData]);

  // ──────────────────────────────────────────────────────────────────────────
  // Error handling - show toast ONCE per unique error
  // ──────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (productsError && !shownErrorsRef.current.has("products")) {
      shownErrorsRef.current.add("products");
      toast.error("Failed to load products");
    }
  }, [productsError]);

  useEffect(() => {
    if (ordersError && !shownErrorsRef.current.has("orders")) {
      shownErrorsRef.current.add("orders");
      toast.error("Failed to load orders");
    }
  }, [ordersError]);

  // ──────────────────────────────────────────────────────────────────────────
  // Broadcast helper
  // ──────────────────────────────────────────────────────────────────────────
  const broadcast = useCallback(
    async (action: "created" | "updated" | "deleted", medicine: { id: number; name?: string; price?: number; quantity?: number }) => {
      try {
        const payload = buildMedicineChangePayload(action, medicine);
        await invoke("BroadcastNotification", payload);
      } catch (err) {
        console.error("SignalR broadcast error:", err);
      }
    },
    [invoke]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Product handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handlePriceChange = useCallback(
    (id: number, value: string) => updateLocalProduct(id, { price: parseFloat(value) || 0 }),
    [updateLocalProduct]
  );

  const handleStockChange = useCallback(
    (id: number, value: string) => updateLocalProduct(id, { stock: parseInt(value, 10) || 0 }),
    [updateLocalProduct]
  );

  const handleStockIncrement = useCallback(
    (id: number, delta: number) => {
      const p = products.find((x) => x.id === id);
      if (p) updateLocalProduct(id, { stock: Math.max(0, p.stock + delta) });
    },
    [products, updateLocalProduct]
  );

  const handleCategoryChange = useCallback(
    (id: number, categoryId: number | null) => updateLocalProduct(id, { categoryId }),
    [updateLocalProduct]
  );

  const handleImageChange = useCallback(
    async (id: number, file: File) => {
      const p = products.find((x) => x.id === id);
      if (!p) return;
      try {
        await updateProductImage(id, file);
        toast.success("Image updated");
        broadcast("updated", { id, name: p.name });
      } catch (err) {
        toast.error("Failed to upload image");
      }
    },
    [products, updateProductImage, broadcast]
  );

  const handleToggleHidden = useCallback(
    async (id: number) => {
      const p = products.find((x) => x.id === id);
      if (!p) return;
      try {
        await toggleHidden(id);
        broadcast("updated", { id, name: p.name });
      } catch (err) {
        toast.error("Failed to update visibility");
      }
    },
    [products, toggleHidden, broadcast]
  );

  const handleSaveAll = useCallback(async () => {
    try {
      await saveAll();
      toast.success("Changes saved");
    } catch (err) {
      toast.error("Failed to save changes");
    }
  }, [saveAll]);

  const handleUndo = useCallback(() => {
    undoChanges();
    toast("Reverted changes");
  }, [undoChanges]);

  const handleDeleteProduct = useCallback(
    (id: number, name: string) => {
      openConfirm(id, name);
    },
    [openConfirm]
  );

  const confirmDelete = useCallback(async () => {
    if (confirmTarget === null) return;
    setConfirmLoading(true);
    try {
      await removeProduct(confirmTarget);
      toast.success("Product deleted");
      broadcast("deleted", { id: confirmTarget, name: confirmName });
    } catch {
      toast.error("Delete failed");
    } finally {
      closeConfirm();
    }
  }, [confirmTarget, confirmName, removeProduct, broadcast, setConfirmLoading, closeConfirm]);

  const handleAddProduct = useCallback(
    async (data: { name: string; price: number; stock: number; categoryId: number | null; imageFile: File | null }) => {
      try {
        const created = await createProduct({
          name: data.name,
          price: data.price,
          stock: data.stock,
          categoryId: data.categoryId,
          imageFile: data.imageFile,
        });
        if (created) {
          toast.success("Product created");
          broadcast("created", { id: created.id, name: created.name });
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed to create product";
        toast.error(message);
      }
    },
    [createProduct, broadcast]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // User handlers
  // ──────────────────────────────────────────────────────────────────────────
  const handleAddUser = useCallback(async () => {
    // Validate
    if (!newUserForm.userName.trim()) {
      toast.error("Username is required");
      return;
    }
    if (!newUserForm.password.trim() || newUserForm.password.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }
    // Check for duplicate username
    if (users.some((u) => u.userName.toLowerCase() === newUserForm.userName.toLowerCase())) {
      toast.error("Username already exists");
      return;
    }
    // Check for duplicate email if provided
    if (newUserForm.email && users.some((u) => u.email?.toLowerCase() === newUserForm.email?.toLowerCase())) {
      toast.error("Email already exists");
      return;
    }

    setUserSaving(true);
    try {
      const created = await createUser(newUserForm);
      setUsers((prev) => [...prev, created]);
      setNewUserForm({ userName: "", password: "", email: "", role: "Pharmacist" });
      setShowAddUserForm(false);
      toast.success("User created successfully");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to create user";
      toast.error(message);
    } finally {
      setUserSaving(false);
    }
  }, [newUserForm, users]);

  /**
   * Open custom user delete confirmation modal
   * Does NOT use window.confirm - shows custom modal instead
   */
  const openDeleteUserModal = useCallback((user: User) => {
    setUserToDelete(user);
  }, []);

  /**
   * Close user delete confirmation modal
   */
  const closeDeleteUserModal = useCallback(() => {
    setUserToDelete(null);
  }, []);

  /**
   * Confirm and execute user deletion
   * Called from custom delete modal
   */
  const confirmDeleteUser = useCallback(async () => {
    if (!userToDelete) return;
    
    setUserDeleting(true);
    try {
      await deleteUser(userToDelete.id);
      setUsers((prev) => prev.filter((u) => u.id !== userToDelete.id));
      toast.success("User deleted successfully");
      closeDeleteUserModal();
    } catch (err) {
      toast.error("Failed to delete user");
    } finally {
      setUserDeleting(false);
    }
  }, [userToDelete, closeDeleteUserModal]);

  /**
   * Handle user role change via PATCH request
   * 
   * SAFETY CHECKS:
   * - Prevents admin from demoting themselves (self-demotion protection)
   * - Shows appropriate error messages
   * - Updates UI immediately on success
   */
  const handleRoleChange = useCallback(async (user: User, newRole: string) => {
    // Get current logged-in user from token - use sessionStorage first
    const token = sessionStorage.getItem("token") || localStorage.getItem("token");
    if (!token) return;
    
    // Decode JWT to get current user info (simple base64 decode of payload)
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const currentUserId = payload.nameid || payload.sub;
      
      // SAFETY: Prevent self-demotion from Admin role
      if (user.id === currentUserId && user.role.toLowerCase() === "admin" && newRole.toLowerCase() !== "admin") {
        toast.error("You cannot remove your own Admin role. Ask another admin to change your role.");
        return;
      }
    } catch {
      // If token decode fails, proceed anyway (backend will validate)
    }

    setRoleUpdating(user.id);
    try {
      const updated = await updateUserRole(user.id, newRole);
      // Update user in local state
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, role: updated.role } : u)));
      toast.success(`${user.userName}'s role updated to ${newRole}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update role";
      toast.error(message);
    } finally {
      setRoleUpdating(null);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Supplier handlers (for SupplierPanel)
  // ──────────────────────────────────────────────────────────────────────────
  const handleAddSupplier = useCallback(async (newSupplier: Omit<Supplier, "id">) => {
    const created = await createSupplier(newSupplier);
    setSuppliers((prev) => [...prev, created]);
    toast.success("Supplier added successfully");
  }, []);

  const handleDeleteSupplier = useCallback(async (supplierId: number) => {
    await deleteSupplier(supplierId);
    setSuppliers((prev) => prev.filter((s) => s.id !== supplierId));
    toast.success("Supplier deleted successfully");
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Supply Stock handlers (for SupplyStockPanel)
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Create a new supply stock order
   * - Sets status to "Created" by default
   * - Admin can then approve → order → etc.
   */
  const handleCreateSupplyStock = useCallback(async (dto: CreateSupplyStockDto) => {
    const created = await createSupplyStock(dto);
    setSupplyStocks((prev) => [created, ...prev]);
  }, []);

  /**
   * Update supply stock status
   * 
   * Status Flow:
   * Created → Approved → Ordered → Shipped → Received → Stored
   * 
   * When status becomes "Stored":
   * - Backend adds quantities to main inventory (Medicine.Quantity)
   * - Item is removed from active list (handled by getSupplyStocks/active endpoint)
   * - We refresh the product list to reflect updated stock
   */
  const handleUpdateSupplyStockStatus = useCallback(async (id: number, status: SupplyStockStatus) => {
    const updated = await updateSupplyStockStatus(id, status);
    
    // If status changed to Stored or Cancelled, remove from list
    // (backend /active endpoint excludes these, but we can do it locally too)
    if (status === SupplyStockStatus.Stored || status === SupplyStockStatus.Cancelled) {
      setSupplyStocks((prev) => prev.filter((s) => s.id !== id));
      
      // If stored, refresh products to show updated stock
      if (status === SupplyStockStatus.Stored) {
        reloadProducts();
      }
    } else {
      setSupplyStocks((prev) => prev.map((s) => (s.id === id ? updated : s)));
    }
  }, [reloadProducts]);

  /**
   * Refresh supply stocks data (called after editing)
   */
  const handleRefreshSupplyStocks = useCallback(async () => {
    setSupplyStocksLoading(true);
    try {
      const data = await getSupplyStocks();
      setSupplyStocks(data);
    } catch (err) {
      toast.error("Failed to refresh supply stocks");
    } finally {
      setSupplyStocksLoading(false);
    }
  }, []);

  // ──────────────────────────────────────────────────────────────────────────
  // Category Management handlers
  // ──────────────────────────────────────────────────────────────────────────
  
  /**
   * Open modal to create new category
   */
  const openCreateCategoryModal = useCallback(() => {
    setEditingCategory(null);
    setCategoryName("");
    setShowCategoryModal(true);
  }, []);

  /**
   * Open modal to edit existing category
   */
  const openEditCategoryModal = useCallback((category: { id: number; name: string }) => {
    setEditingCategory(category);
    setCategoryName(category.name);
    setShowCategoryModal(true);
  }, []);

  /**
   * Close category modal and reset state
   */
  const closeCategoryModal = useCallback(() => {
    setShowCategoryModal(false);
    setEditingCategory(null);
    setCategoryName("");
  }, []);

  /**
   * Save category (create or update)
   */
  const handleSaveCategory = useCallback(async () => {
    const trimmedName = categoryName.trim();
    if (!trimmedName) {
      toast.error("Category name is required");
      return;
    }

    // Check for duplicate name
    const duplicate = categories.find(
      (c) => c.name.toLowerCase() === trimmedName.toLowerCase() && c.id !== editingCategory?.id
    );
    if (duplicate) {
      toast.error("Category name already exists");
      return;
    }

    setCategorySaving(true);
    try {
      if (editingCategory) {
        // Update existing
        await editCategory(editingCategory.id, trimmedName);
        toast.success("Category updated");
      } else {
        // Create new
        await addCategory(trimmedName);
        toast.success("Category created");
      }
      closeCategoryModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operation failed";
      toast.error(message);
    } finally {
      setCategorySaving(false);
    }
  }, [categoryName, categories, editingCategory, addCategory, editCategory, closeCategoryModal]);

  /**
   * Toggle category selection for multi-category filtering
   * Clicking a category adds/removes it from the selected set
   * Visual glow indicates selection state
   */
  const toggleCategoryFilter = useCallback((categoryId: number) => {
    setSelectedCategories((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(categoryId)) {
        newSet.delete(categoryId); // Deselect if already selected
      } else {
        newSet.add(categoryId); // Select if not selected
      }
      return newSet;
    });
  }, []);

  /**
   * Open custom category delete confirmation modal
   * Does NOT use window.confirm - shows custom modal instead
   */
  const openDeleteCategoryModal = useCallback((categoryId: number, categoryName: string) => {
    setCategoryToDelete({ id: categoryId, name: categoryName });
  }, []);

  /**
   * Close category delete confirmation modal
   */
  const closeDeleteCategoryModal = useCallback(() => {
    setCategoryToDelete(null);
  }, []);

  /**
   * Confirm and execute category deletion
   * Called from custom delete modal
   */
  const confirmDeleteCategory = useCallback(async () => {
    if (!categoryToDelete) return;
    
    setCategoryDeleting(true);
    try {
      await removeCategory(categoryToDelete.id);
      toast.success("Category deleted");
      
      // If deleted category was in multi-select filter, remove it
      setSelectedCategories((prev) => {
        const newSet = new Set(prev);
        newSet.delete(categoryToDelete.id);
        return newSet;
      });
      
      closeDeleteCategoryModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete category";
      toast.error(message);
    } finally {
      setCategoryDeleting(false);
    }
  }, [categoryToDelete, removeCategory, closeDeleteCategoryModal]);

  // ──────────────────────────────────────────────────────────────────────────
  // Clear filters handler - resets all product filters including multi-category
  // ──────────────────────────────────────────────────────────────────────────
  const clearFilters = useCallback(() => {
    setFilterHidden("all");
    setSelectedCategories(new Set()); // Clear multi-category filter
    setSearchTerm("");
  }, []);

  // Check if any filter is active - includes multi-category selection
  const hasActiveFilters = filterHidden !== "all" || selectedCategories.size > 0 || searchTerm !== "";

  // ──────────────────────────────────────────────────────────────────────────
  // Derived data
  // ──────────────────────────────────────────────────────────────────────────
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesHidden =
        filterHidden === "all" ||
        (filterHidden === "visible" && !p.hidden) ||
        (filterHidden === "hidden" && p.hidden);
      // Multi-category filter: if no categories selected, show all
      // If categories selected, product must belong to ANY selected category (OR logic)
      // Handle undefined/null categoryId by excluding from filter match
      const matchesCategory = selectedCategories.size === 0 || 
        (p.categoryId != null && selectedCategories.has(p.categoryId));
      return matchesSearch && matchesHidden && matchesCategory;
    });
  }, [products, searchTerm, filterHidden, selectedCategories]);

  const totalStock = useMemo(() => products.reduce((s, p) => s + p.stock, 0), [products]);

  /**
   * Low stock products count
   * Products with stock < LOW_STOCK_THRESHOLD (30) are considered low stock
   * This is displayed in Products section only (removed from other areas)
   */
  const lowStockCount = useMemo(() => 
    products.filter((p) => p.stock < LOW_STOCK_THRESHOLD).length, 
    [products]
  );

  // ──────────────────────────────────────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────────────────────────────────────
  const getPageTitle = () => {
    switch (activePage) {
      case "products": return "Products";
      case "orders": return "Orders";
      case "stocks": return "Stocks & Suppliers";
      case "users": return "Users Management";
      default: return "Dashboard";
    }
  };

  return (
    <div className={`flex h-screen ${darkMode ? "dark bg-gray-900 text-gray-100" : "bg-gray-100 text-gray-900"}`}>
      {/* Sidebar */}
      <Sidebar
        title="Admin Panel"
        items={NAV_ITEMS}
        activePage={activePage}
        onNavigate={(id) => setActivePage(id as PageType)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <DashboardHeader
          title={getPageTitle()}
          darkMode={darkMode}
          onToggleDarkMode={toggleDarkMode}
          showSearch={activePage === "products"}
          searchPlaceholder="Search medicines..."
          searchValue={searchTerm}
          onSearchChange={setSearchTerm}
          showSaveUndo={activePage === "products"}
          isDirty={isDirty}
          saving={saving}
          onSave={handleSaveAll}
          onUndo={handleUndo}
        >
          {/* Filters for products page - Category filter removed, now in Categories panel */}
          {activePage === "products" && (
            <div className="flex items-center gap-2 ml-2">
              {/* Visibility filter - visible/hidden toggle */}
              <div className="flex items-center gap-1 border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
                <button
                  onClick={() => setFilterHidden("visible")}
                  className={`p-1.5 transition-colors ${
                    filterHidden === "visible" 
                      ? "bg-purple-600 text-white" 
                      : "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  title="Show visible products only"
                >
                  <Eye className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setFilterHidden("hidden")}
                  className={`p-1.5 transition-colors ${
                    filterHidden === "hidden" 
                      ? "bg-purple-600 text-white" 
                      : "bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }`}
                  title="Show hidden products only"
                >
                  <EyeOff className="h-4 w-4" />
                </button>
              </div>
              
              {/* Enhanced Clear filters button */}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 dark:text-red-400 
                    bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 
                    rounded-lg shadow-sm hover:bg-red-100 dark:hover:bg-red-900/40 
                    hover:shadow-md transition-all duration-200"
                  title="Clear all filters"
                >
                  <X className="h-3.5 w-3.5" />
                  Clear Filters
                </button>
              )}
            </div>
          )}
        </DashboardHeader>

        <main className="flex-1 overflow-y-auto p-6">
          {/* ─── Products Page ─────────────────────────────────────────────── */}
          {activePage === "products" && (
            <>
              {/* Stats Row - Total Products and Low Stock Count */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <StatCard label="Total Products" value={products.length} />
                {/* Low Stock indicator - products with stock < 30 */}
                <div className={`p-4 rounded-xl shadow-md ${
                  lowStockCount > 0 
                    ? "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700" 
                    : "bg-white dark:bg-gray-800"
                }`}>
                  <div className="flex items-center gap-2">
                    {lowStockCount > 0 && <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    <span className={`text-sm font-medium ${
                      lowStockCount > 0 
                        ? "text-amber-700 dark:text-amber-400" 
                        : "text-gray-500 dark:text-gray-400"
                    }`}>
                      Low Stock Products
                    </span>
                  </div>
                  <div className={`text-2xl font-bold mt-1 ${
                    lowStockCount > 0 
                      ? "text-amber-600 dark:text-amber-400" 
                      : "text-gray-900 dark:text-gray-100"
                  }`}>
                    {lowStockCount}
                  </div>
                </div>
                <StatCard label="Total Stock Units" value={totalStock} />
                <StatCard label="Categories" value={categories.length} />
              </div>

              {/* Category Management Panel - Click category name to filter products */}
              <div className={`mb-6 rounded-xl shadow-lg overflow-hidden ${darkMode ? "bg-gray-800" : "bg-white"}`}>
                <div className="px-5 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <h3 className="text-lg font-semibold flex items-center gap-2">
                      <FolderOpen className="h-5 w-5 text-purple-600" />
                      Categories
                    </h3>
                    {/* Show active filter count indicator */}
                    {selectedCategories.size > 0 && (
                      <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        {selectedCategories.size} selected
                      </span>
                    )}
                  </div>
                  <button
                    onClick={openCreateCategoryModal}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add Category
                  </button>
                </div>
                <div className="p-4">
                  {categories.length === 0 ? (
                    <div className="text-center text-gray-500 py-4">No categories yet. Create your first category!</div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => {
                        const productCount = products.filter((p) => p.categoryId === cat.id).length;
                        // Check if this category is selected for filtering
                        const isSelected = selectedCategories.has(cat.id);
                        
                        return (
                          <div
                            key={cat.id}
                            className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 ${
                              isSelected
                                // Selected state - purple glow effect for clear visual feedback
                                ? "bg-purple-100 dark:bg-purple-900/40 border-purple-400 dark:border-purple-500 ring-2 ring-purple-300 dark:ring-purple-600 shadow-md"
                                : darkMode 
                                  ? "bg-gray-700 border-gray-600" 
                                  : "bg-gray-50 border-gray-200"
                            }`}
                          >
                            {/* Clickable category name for filtering */}
                            <button
                              onClick={() => toggleCategoryFilter(cat.id)}
                              className={`font-medium transition-colors ${
                                isSelected 
                                  ? "text-purple-700 dark:text-purple-300" 
                                  : "hover:text-purple-600 dark:hover:text-purple-400"
                              }`}
                              title={isSelected ? "Click to remove filter" : "Click to filter by this category"}
                            >
                              {cat.name}
                            </button>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? "bg-purple-200 text-purple-700 dark:bg-purple-800 dark:text-purple-200"
                                : darkMode ? "bg-gray-600 text-gray-300" : "bg-gray-200 text-gray-600"
                            }`}>
                              {productCount}
                            </span>
                            <button
                              onClick={() => openEditCategoryModal(cat)}
                              className="p-1 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/30 rounded transition-colors"
                              title="Edit category"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => openDeleteCategoryModal(cat.id, cat.name)}
                              className={`p-1 rounded transition-colors ${
                                productCount > 0
                                  ? "text-gray-400 cursor-not-allowed"
                                  : "text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30"
                              }`}
                              title={productCount > 0 ? `Cannot delete - ${productCount} products use this category` : "Delete category"}
                              disabled={productCount > 0}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Add new product form */}
              <NewProductForm 
                saving={saving} 
                darkMode={darkMode} 
                categories={categories}
                onAdd={handleAddProduct} 
              />

              {/* Product list */}
              {productsLoading ? (
                <div className="text-center text-gray-500">Loading products...</div>
              ) : filteredProducts.length === 0 ? (
                <div className="text-center text-gray-500">No products found</div>
              ) : (
                <div className="flex flex-col gap-4">
                  {filteredProducts.map((product) => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      darkMode={darkMode}
                      categories={categories}
                      onPriceChange={handlePriceChange}
                      onStockChange={handleStockChange}
                      onStockIncrement={handleStockIncrement}
                      onCategoryChange={handleCategoryChange}
                      onToggleHidden={handleToggleHidden}
                      onDelete={handleDeleteProduct}
                      onImageChange={handleImageChange}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {/* ─── Orders Page ───────────────────────────────────────────────── */}
          {activePage === "orders" && (
            <>
              <div className="mb-4">
                <StatCard label="Total Orders" value={orders.length} />
              </div>

              {/* Orders Search */}
              <div className="mb-4">
                <input
                  type="text"
                  placeholder="Search orders by ID or total..."
                  value={ordersSearchTerm}
                  onChange={(e) => setOrdersSearchTerm(e.target.value)}
                  className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
              </div>

              {ordersLoading ? (
                <div className="text-center text-gray-500">Loading orders...</div>
              ) : orders.length === 0 ? (
                <div className="text-center text-gray-500">No orders found</div>
              ) : (
                <div className="flex flex-col gap-3">
                  {orders
                    .filter((order) => {
                      if (!ordersSearchTerm.trim()) return true;
                      const term = ordersSearchTerm.toLowerCase();
                      return (
                        order.id.toString().includes(term) ||
                        order.totalPrice.toString().includes(term)
                      );
                    })
                    .map((order) => (
                      <OrderListItem key={order.id} order={order} onView={fetchOrderDetail} />
                    ))}
                </div>
              )}
            </>
          )}

          {/* ─── Stocks Page ───────────────────────────────────────────────── */}
          {activePage === "stocks" && (
            <div className="space-y-6">
              {/* Stats Row - Active Supply Orders first, then Suppliers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <StatCard label="Active Supply Orders" value={supplyStocks.length} />
                <StatCard label="Suppliers" value={suppliers.length} />
              </div>

              {/* ─────────────────────────────────────────────────────────────────
                  LAYOUT DECOUPLING:
                  Each panel has independent height via items-start alignment.
                  - items-start prevents panels from stretching to match each other
                  - Each panel manages its own internal scrolling
                  - min-h and max-h applied to each panel's content area
                  ───────────────────────────────────────────────────────────────── */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
                {/* Active Supply Orders Panel - positioned first for visibility */}
                {/* Panel has its own max-height and overflow-y-auto */}
                <div className="h-fit">
                  <SupplyStockPanel
                    supplyStocks={supplyStocks}
                    suppliers={suppliers}
                    medicines={products}
                    loading={supplyStocksLoading}
                    darkMode={darkMode}
                    onCreateSupplyStock={handleCreateSupplyStock}
                    onUpdateStatus={handleUpdateSupplyStockStatus}
                    onRefresh={handleRefreshSupplyStocks}
                  />
                </div>

                {/* Suppliers Panel - positioned second */}
                {/* Panel has its own max-height and overflow-y-auto */}
                <div className="h-fit">
                  <SupplierPanel
                    suppliers={suppliers}
                    loading={suppliersLoading}
                    darkMode={darkMode}
                    onAddSupplier={handleAddSupplier}
                    onDeleteSupplier={handleDeleteSupplier}
                  />
                </div>
              </div>
            </div>
          )}

          {/* ─── Users Page ────────────────────────────────────────────────── */}
          {activePage === "users" && (
            <div className="space-y-6">
              {/* Stats - Now includes Storage Managers count */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard label="Total Users" value={users.length} />
                <StatCard label="Admins" value={users.filter((u) => u.role.toLowerCase() === "admin").length} />
                <StatCard label="Pharmacists" value={users.filter((u) => u.role.toLowerCase() === "pharmacist").length} />
                <StatCard label="Storage Managers" value={users.filter((u) => u.role.toLowerCase() === "storagemanager").length} />
              </div>

              {/* Users Panel */}
              <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <h3 className="text-lg font-semibold flex items-center gap-2">
                    <Users className="h-5 w-5 text-purple-600" />
                    User Accounts
                  </h3>
                  <button
                    onClick={() => setShowAddUserForm(!showAddUserForm)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    Add User
                  </button>
                </div>

                {/* Add User Form */}
                {showAddUserForm && (
                  <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <input
                        type="text"
                        placeholder="Username *"
                        value={newUserForm.userName}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, userName: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <input
                        type="password"
                        placeholder="Password * (min 6 chars)"
                        value={newUserForm.password}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, password: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={newUserForm.email}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, email: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <select
                        value={newUserForm.role}
                        onChange={(e) => setNewUserForm((prev) => ({ ...prev, role: e.target.value }))}
                        className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      >
                        <option value="Pharmacist">Pharmacist</option>
                        <option value="Admin">Admin</option>
                        <option value="StorageManager">Storage Manager</option>
                      </select>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <button
                        onClick={handleAddUser}
                        disabled={userSaving}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                      >
                        {userSaving ? "Creating..." : "Create User"}
                      </button>
                      <button
                        onClick={() => setShowAddUserForm(false)}
                        className="px-4 py-2 bg-gray-200 dark:bg-gray-600 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {/* Users Search */}
                <div className="px-6 py-3 border-b border-gray-200 dark:border-gray-700">
                  <input
                    type="text"
                    placeholder="Search by username, email, or role..."
                    value={usersSearchTerm}
                    onChange={(e) => setUsersSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>

                {/* Users List - with role editing dropdown */}
                <div className="divide-y divide-gray-200 dark:divide-gray-700">
                  {usersLoading ? (
                    <div className="px-6 py-8 text-center text-gray-500">Loading users...</div>
                  ) : users.length === 0 ? (
                    <div className="px-6 py-8 text-center text-gray-500">No users found.</div>
                  ) : (
                    users
                      .filter((user) => {
                        if (!usersSearchTerm.trim()) return true;
                        const term = usersSearchTerm.toLowerCase();
                        return (
                          user.userName.toLowerCase().includes(term) ||
                          (user.email?.toLowerCase().includes(term) ?? false) ||
                          user.role.toLowerCase().includes(term)
                        );
                      })
                      .map((user) => (
                      <div key={user.id} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <div className="flex items-center gap-4">
                          {/* User Avatar with role-based color - DISTINCT colors per role */}
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                            user.role.toLowerCase() === "admin" 
                              ? "bg-red-100 dark:bg-red-900/30"  // Admin: Red (authoritative)
                              : user.role.toLowerCase() === "pharmacist"
                              ? "bg-cyan-100 dark:bg-cyan-900/30"  // Pharmacist: Cyan/Teal (medical)
                              : "bg-orange-100 dark:bg-orange-900/30"  // StorageManager: Orange (logistics)
                          }`}>
                            <Users className={`h-5 w-5 ${
                              user.role.toLowerCase() === "admin" 
                                ? "text-red-600 dark:text-red-400"
                                : user.role.toLowerCase() === "pharmacist"
                                ? "text-cyan-600 dark:text-cyan-400"
                                : "text-orange-600 dark:text-orange-400"
                            }`} />
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">{user.userName}</div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {user.email || "No email"}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {/* Role Dropdown - DISTINCT colors: Admin=Red, Pharmacist=Cyan, StorageManager=Orange */}
                          <select
                            value={user.role}
                            onChange={(e) => handleRoleChange(user, e.target.value)}
                            disabled={roleUpdating === user.id}
                            className={`px-3 py-1.5 text-xs font-medium rounded-lg border cursor-pointer transition-all focus:ring-2 focus:ring-offset-1 ${
                              roleUpdating === user.id ? "opacity-50 cursor-wait" : ""
                            } ${
                              user.role.toLowerCase() === "admin" 
                                ? "bg-red-50 text-red-800 border-red-300 dark:bg-gray-700 dark:text-red-300 dark:border-red-500/50 focus:ring-red-500"
                                : user.role.toLowerCase() === "pharmacist"
                                ? "bg-cyan-50 text-cyan-800 border-cyan-300 dark:bg-gray-700 dark:text-cyan-300 dark:border-cyan-500/50 focus:ring-cyan-500"
                                : "bg-orange-50 text-orange-800 border-orange-300 dark:bg-gray-700 dark:text-orange-300 dark:border-orange-500/50 focus:ring-orange-500"
                            }`}
                          >
                            <option value="Admin">Admin</option>
                            <option value="Pharmacist">Pharmacist</option>
                            <option value="StorageManager">Storage Manager</option>
                          </select>
                          {/* Delete Button - opens custom modal */}
                          <button
                            onClick={() => openDeleteUserModal(user)}
                            className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/30 rounded-lg transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Invoice Modal */}
      {selectedOrder && (
        <InvoiceModal order={selectedOrder} darkMode={darkMode} onClose={closeOrderDetail} />
      )}

      {/* Delete confirmation modal */}
      <ConfirmModal
        isOpen={confirmOpen}
        title="Delete product?"
        message={`Are you sure you want to delete "${confirmName}"?`}
        loading={confirmLoading}
        darkMode={darkMode}
        onConfirm={confirmDelete}
        onCancel={closeConfirm}
      />

      {/* ─── Category Management Modal ─────────────────────────────────────── */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
              <h3 className="text-lg font-semibold">
                {editingCategory ? "Edit Category" : "Create Category"}
              </h3>
              <button
                onClick={closeCategoryModal}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-6">
              <label className={`block text-sm font-medium mb-2 ${
                darkMode ? "text-gray-300" : "text-gray-700"
              }`}>
                Category Name *
              </label>
              <input
                type="text"
                value={categoryName}
                onChange={(e) => setCategoryName(e.target.value)}
                placeholder="Enter category name..."
                autoFocus
                className={`w-full px-4 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                  darkMode 
                    ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400" 
                    : "bg-white border-gray-300 placeholder-gray-500"
                }`}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCategory();
                  if (e.key === "Escape") closeCategoryModal();
                }}
              />
              <div className="flex gap-3 mt-6">
                <button
                  onClick={handleSaveCategory}
                  disabled={categorySaving || !categoryName.trim()}
                  className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
                >
                  {categorySaving ? "Saving..." : editingCategory ? "Update" : "Create"}
                </button>
                <button
                  onClick={closeCategoryModal}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Category Delete Confirmation Modal ──────────────────────────── */}
      {/* Custom modal for category deletion - does NOT use generic ConfirmModal */}
      {categoryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            {/* Modal Header with Warning Icon */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Delete Category
              </h3>
            </div>
            
            {/* Modal Content */}
            <div className="p-6">
              {/* Check if category is in use */}
              {(() => {
                const productsUsingCategory = products.filter(
                  (p) => p.categoryId === categoryToDelete.id
                ).length;
                
                if (productsUsingCategory > 0) {
                  // Category is in use - show warning and block deletion
                  return (
                    <>
                      <div className={`p-4 rounded-lg mb-4 ${
                        darkMode ? "bg-amber-900/30 border border-amber-700" : "bg-amber-50 border border-amber-200"
                      }`}>
                        <p className={`text-sm font-medium ${darkMode ? "text-amber-400" : "text-amber-700"}`}>
                          ⚠️ Cannot Delete Category
                        </p>
                        <p className={`text-sm mt-1 ${darkMode ? "text-amber-300" : "text-amber-600"}`}>
                          The category "<strong>{categoryToDelete.name}</strong>" is currently used by{" "}
                          <strong>{productsUsingCategory} product{productsUsingCategory !== 1 ? "s" : ""}</strong>.
                        </p>
                        <p className={`text-sm mt-2 ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                          Please reassign these products to a different category before deleting.
                        </p>
                      </div>
                      <div className="flex justify-end">
                        <button
                          onClick={closeDeleteCategoryModal}
                          className={`px-4 py-2 rounded-lg transition-colors ${
                            darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"
                          }`}
                        >
                          Close
                        </button>
                      </div>
                    </>
                  );
                }
                
                // Category is NOT in use - allow deletion
                return (
                  <>
                    <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                      Are you sure you want to delete the category:
                    </p>
                    <p className={`text-lg font-semibold mt-2 mb-4 ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                      "{categoryToDelete.name}"
                    </p>
                    <div className={`p-3 rounded-lg mb-4 ${
                      darkMode ? "bg-gray-700" : "bg-gray-100"
                    }`}>
                      <p className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        This action cannot be undone. The category will be permanently removed.
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={confirmDeleteCategory}
                        disabled={categoryDeleting}
                        className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {categoryDeleting ? "Deleting..." : "Confirm Delete"}
                      </button>
                      <button
                        onClick={closeDeleteCategoryModal}
                        disabled={categoryDeleting}
                        className={`px-4 py-2 rounded-lg transition-colors ${
                          darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"
                        }`}
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── User Delete Confirmation Modal ──────────────────────────────── */}
      {/* Custom modal for user deletion - does NOT use generic ConfirmModal */}
      {userToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            {/* Modal Header with Warning Icon */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center gap-3">
              <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <h3 className="text-lg font-semibold text-red-600 dark:text-red-400">
                Remove User Account
              </h3>
            </div>
            
            {/* Modal Content */}
            <div className="p-6">
              <p className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                You are about to remove the following user:
              </p>
              
              {/* User Info Card */}
              <div className={`mt-4 p-4 rounded-lg flex items-center gap-4 ${
                darkMode ? "bg-gray-700" : "bg-gray-100"
              }`}>
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  userToDelete.role.toLowerCase() === "admin" 
                    ? "bg-purple-100 dark:bg-purple-900/30"
                    : userToDelete.role.toLowerCase() === "pharmacist"
                    ? "bg-blue-100 dark:bg-blue-900/30"
                    : "bg-amber-100 dark:bg-amber-900/30"
                }`}>
                  <Users className={`h-6 w-6 ${
                    userToDelete.role.toLowerCase() === "admin" 
                      ? "text-purple-600 dark:text-purple-400"
                      : userToDelete.role.toLowerCase() === "pharmacist"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`} />
                </div>
                <div>
                  <div className={`font-semibold text-lg ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                    {userToDelete.userName}
                  </div>
                  <div className={`text-sm ${
                    userToDelete.role.toLowerCase() === "admin" 
                      ? "text-purple-600 dark:text-purple-400"
                      : userToDelete.role.toLowerCase() === "pharmacist"
                      ? "text-blue-600 dark:text-blue-400"
                      : "text-amber-600 dark:text-amber-400"
                  }`}>
                    {userToDelete.role}
                  </div>
                </div>
              </div>

              {/* Warning Message */}
              <div className={`mt-4 p-3 rounded-lg ${
                darkMode ? "bg-red-900/20 border border-red-800" : "bg-red-50 border border-red-200"
              }`}>
                <p className={`text-sm ${darkMode ? "text-red-300" : "text-red-700"}`}>
                  ⚠️ <strong>This action is irreversible.</strong> The user account and all associated data will be permanently removed from the system.
                </p>
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={confirmDeleteUser}
                  disabled={userDeleting}
                  className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {userDeleting ? "Removing..." : "Confirm Remove"}
                </button>
                <button
                  onClick={closeDeleteUserModal}
                  disabled={userDeleting}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"
                  }`}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
