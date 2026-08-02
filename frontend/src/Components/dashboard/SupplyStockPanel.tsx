// src/Components/dashboard/SupplyStockPanel.tsx
/**
 * Supply Stock Panel Component
 * ─────────────────────────────────────────────────────────────────────────────
 * 
 * Manages supply stock orders for the Admin Dashboard.
 * 
 * Features:
 * - Create/Edit supply stocks with searchable medicine selection
 * - Status workflow visualization (Created → Approved → Ordered → ...)
 * - Pagination for large datasets
 * - Debounced search
 * - Edit restrictions (only when status === "Created")
 * - Real-time status updates
 * - Pricing display with unit price, quantity, and totals
 * 
 * Status Flow:
 * Created → Approved → Ordered → Shipped → Received → Stored
 *                                              ↓
 *                                        Cancelled (before Shipped only)
 * 
 * Inventory Logic:
 * - When status becomes "Stored", backend adds quantities to main inventory
 * - Stored items are automatically excluded from the active list
 * - Stock values are NEVER modified during creation, only on "Stored" status
 * 
 * Image Handling:
 * - Images can be relative paths (from backend uploads) or absolute URLs
 * - Relative paths are prefixed with API base URL
 * - Fallback to placeholder icon if image fails to load or doesn't exist
 */
import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { 
  Package, Plus, Search, ChevronRight, X,
  Edit2, Trash2, Calendar, AlertCircle,
  ChevronLeft, ChevronDown, DollarSign
} from "lucide-react";
import {
  type SupplyStock,
  type SupplyStockItem,
  type CreateSupplyStockDto,
  type UpdateSupplyStockDto,
  SupplyStockStatus,
  SUPPLY_STOCK_STATUS_CONFIG,
  canAdminPerformAction,
  formatDate,
  updateSupplyStock,
} from "../../Services/SupplyOrderService";
import type { Supplier } from "../../Services/SupplierService";
import type { MedicineDisplay } from "../../Services/MedicineService";
import toast from "react-hot-toast";
import {
  suggestPurchasePrice,
  type PurchasePriceSuggestion,
} from "../../Services/StatsService";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

// Low stock threshold - medicines below this are considered low stock
const LOW_STOCK_THRESHOLD = 30;

// API base URL for image paths
const API_BASE_URL = process.env.REACT_APP_API_BASE || "http://localhost:5057";

/**
 * Build full image URL from potentially relative path
 * Handles: absolute URLs, data URIs, and relative paths from backend uploads
 */
const buildImageUrl = (imagePath: string | undefined | null): string => {
  if (!imagePath) return "";
  // Already absolute URL or data URI - use as-is
  if (imagePath.startsWith("http") || imagePath.startsWith("data:")) {
    return imagePath;
  }
  // Relative path - prefix with API base
  return `${API_BASE_URL}${imagePath}`;
};

// ─────────────────────────────────────────────────────────────────────────────
// Extended item type for form with price tracking
// ─────────────────────────────────────────────────────────────────────────────
/**
 * FormItem extends SupplyStockItem with additional UI fields
 * 
 * PRICING DISTINCTION (Real Pharmacy Logic):
 * - purchasePrice: Price paid TO the supplier (cost to pharmacy) - EDITABLE
 * - sellingPrice: Price charged TO customers (from Medicine.price) - READ-ONLY, for reference only
 * 
 * The purchasePrice is what gets stored with the supply order.
 * The sellingPrice is shown for reference but NEVER modified during supply stock operations.
 */
interface FormItem extends SupplyStockItem {
  purchasePrice: number;  // Price paid to supplier (editable when status === "Created")
  sellingPrice: number;   // Product selling price (read-only reference)
  image?: string;         // Medicine image for display
  /**
   * True once the admin has typed their own purchase price for this line. Until then
   * the price follows the suggestion, and re-prices when the quantity changes, because
   * the bulk discount depends on order size. After an override it is left alone -
   * a negotiated price must not be silently replaced.
   */
  priceOverridden?: boolean;
}

/**
 * Ceiling on a single line's quantity, mirroring StatsController.MaxOrderQuantity.
 *
 * Above int.MaxValue the pricing request failed model binding server-side and the
 * suggested price simply vanished from the form with no explanation. A limit that
 * matches the server keeps the failure from ever being reached, and states the rule.
 */
const MAX_ORDER_QUANTITY = 1_000_000;

// ─────────────────────────────────────────────────────────────────────────────
// Props Interface
// ─────────────────────────────────────────────────────────────────────────────
interface SupplyStockPanelProps {
  supplyStocks: SupplyStock[];
  suppliers: Supplier[];
  medicines: MedicineDisplay[];
  loading: boolean;
  darkMode: boolean;
  onCreateSupplyStock: (data: CreateSupplyStockDto) => Promise<void>;
  onUpdateStatus: (id: number, status: SupplyStockStatus) => Promise<void>;
  onDeleteSupplyStock?: (id: number) => Promise<void>; // Delete supply stock (Admin only)
  onRefresh?: () => void; // Optional refresh callback after edit
  /** Hides every control that changes a supply order. The server refuses them anyway. */
  readOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
export function SupplyStockPanel({
  supplyStocks,
  suppliers,
  medicines,
  loading,
  darkMode,
  onCreateSupplyStock,
  onUpdateStatus,
  onDeleteSupplyStock,
  onRefresh,
  readOnly = false,
}: SupplyStockPanelProps) {
  // ─────────────────────────────────────────────────────────────────────────
  // Search & Pagination State
  // ─────────────────────────────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Debounce search input
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedSearch(searchTerm);
      setCurrentPage(1); // Reset to first page on search
    }, SEARCH_DEBOUNCE_MS);
    
    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchTerm]);

  // ─────────────────────────────────────────────────────────────────────────
  // Create/Edit Form State
  // ─────────────────────────────────────────────────────────────────────────
  const [showForm, setShowForm] = useState(false);
  const [editingStock, setEditingStock] = useState<SupplyStock | null>(null);
  const [formSupplierId, setFormSupplierId] = useState<number | "">("");
  // Use extended FormItem type for price tracking
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  const [formNotes, setFormNotes] = useState("");
  const [formSaving, setFormSaving] = useState(false);

  // Medicine selector state
  const [medicineSearch, setMedicineSearch] = useState("");
  const [showMedicineDropdown, setShowMedicineDropdown] = useState(false);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number | null>(null);
  const [selectedQuantity, setSelectedQuantity] = useState(1);
  // Purchase price for the item being added. Prefilled from the suggestion as soon as
  // one arrives, so the common case needs no interaction - the admin previously had to
  // click a "use $X" button, and the field sat empty until they did.
  const [selectedPurchasePrice, setSelectedPurchasePrice] = useState<number>(0);
  // Set once the admin types their own price. From then on the suggestion is shown for
  // comparison but never written over what they entered.
  const [priceOverridden, setPriceOverridden] = useState(false);
  const [suggestion, setSuggestion] = useState<PurchasePriceSuggestion | null>(null);

  // Ask the server what this should cost from a supplier, for this order size.
  // Debounced because quantity is a free-text number input.
  useEffect(() => {
    const medicine = medicines.find((m) => m.id === selectedMedicineId);
    if (!medicine || selectedQuantity < 1 || selectedQuantity > MAX_ORDER_QUANTITY) {
      setSuggestion(null);
      return;
    }

    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await suggestPurchasePrice(medicine.price, selectedQuantity);
        if (cancelled) return;
        setSuggestion(result);
        // Follow the suggestion until the admin overrides it. The bulk discount moves
        // with quantity, so the price has to move with it too.
        setPriceOverridden((overridden) => {
          if (!overridden) setSelectedPurchasePrice(result.suggestedUnitPrice);
          return overridden;
        });
      } catch {
        if (!cancelled) setSuggestion(null);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedMedicineId, selectedQuantity, medicines]);

  // A different medicine means a different price; start following the suggestion again.
  useEffect(() => {
    setPriceOverridden(false);
    setSelectedPurchasePrice(0);
  }, [selectedMedicineId]);

  // Action loading state
  const [actionLoading, setActionLoading] = useState<number | null>(null);

  // Expanded item details
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Cancel confirmation modal state
  const [stockToCancel, setStockToCancel] = useState<SupplyStock | null>(null);
  const [cancelConfirming, setCancelConfirming] = useState(false);

  // Delete confirmation modal state
  const [stockToDelete, setStockToDelete] = useState<SupplyStock | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Calculated Values
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Calculate total ORDER COST from all form items
   * Total = sum of (purchasePrice × quantity) for each item
   * 
   * IMPORTANT: This uses purchasePrice (supplier cost), NOT sellingPrice
   * This represents the total cost to the pharmacy for this supply order
   */
  const formTotalCost = useMemo(() => {
    return formItems.reduce((total, item) => total + (item.purchasePrice * item.quantity), 0);
  }, [formItems]);

  /**
   * Total number of items in current form
   */
  const formItemCount = formItems.length;

  // ─────────────────────────────────────────────────────────────────────────
  // Filtered & Paginated Data
  // ─────────────────────────────────────────────────────────────────────────
  const filteredStocks = useMemo(() => {
    if (!debouncedSearch.trim()) return supplyStocks;
    
    const term = debouncedSearch.toLowerCase();
    return supplyStocks.filter((stock) => {
      // Search by supplier name
      const supplierMatch = stock.supplierName?.toLowerCase().includes(term);
      // Search by status
      const statusMatch = stock.status.toLowerCase().includes(term);
      // Search by medicine names in items
      const itemMatch = stock.items?.some((item) => 
        item.medicineName?.toLowerCase().includes(term)
      );
      // Search by ID
      const idMatch = stock.id.toString().includes(term);
      return supplierMatch || statusMatch || itemMatch || idMatch;
    });
  }, [supplyStocks, debouncedSearch]);

  // Pagination
  const totalPages = Math.ceil(filteredStocks.length / PAGE_SIZE);
  const paginatedStocks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return filteredStocks.slice(start, start + PAGE_SIZE);
  }, [filteredStocks, currentPage]);

  // Filtered medicines for dropdown (with search, limited for performance)
  const filteredMedicines = useMemo(() => {
    if (!medicineSearch.trim()) return medicines.slice(0, 50);
    const term = medicineSearch.toLowerCase();
    return medicines
      .filter((m) => m.name.toLowerCase().includes(term))
      .slice(0, 50); // Limit to 50 results for performance
  }, [medicines, medicineSearch]);

  // ─────────────────────────────────────────────────────────────────────────
  // Form Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  // Reset form to initial state
  const resetForm = useCallback(() => {
    setShowForm(false);
    setEditingStock(null);
    setFormSupplierId("");
    setFormItems([]);
    setFormNotes("");
    setMedicineSearch("");
    setSelectedMedicineId(null);
    setSelectedQuantity(1);
    setSelectedPurchasePrice(0);
    setShowMedicineDropdown(false);
  }, []);

  // Open form for creating new supply stock
  const openCreateForm = useCallback(() => {
    resetForm();
    setShowForm(true);
  }, [resetForm]);

  /**
   * Open form for editing existing supply stock
   * EDIT RESTRICTION: Only allowed when status === "Created"
   * This ensures orders in progress cannot be modified
   * 
   * CRITICAL DATA PRESERVATION:
   * - unitPrice (BUY price) MUST come from stock.items[].unitPrice
   * - quantity MUST come from stock.items[].quantity
   * - DO NOT reset or overwrite with Medicine data
   */
  const openEditForm = useCallback((stock: SupplyStock) => {
    if (!canAdminPerformAction(stock.status, "edit")) {
      toast.error("Cannot edit - order has already been processed");
      return;
    }
    
    setEditingStock(stock);
    setFormSupplierId(stock.supplierId);
    
    /**
     * PRESERVE VALUES FROM SUPPLY ORDER (NOT FROM MEDICINE):
     * - purchasePrice = stock item's unitPrice (stored BUY price)
     * - quantity = stock item's quantity
     * - sellingPrice = medicine's retail price (reference only)
     */
    const itemsWithPrices: FormItem[] = stock.items.map((item) => {
      const medicine = medicines.find((m) => m.id === item.medicineId);
      
      // CRITICAL: item.unitPrice is the stored BUY price from the supply order
      // This value was saved when the order was created and must be preserved
      const storedBuyPrice = item.unitPrice;
      const storedQuantity = item.quantity;
      
      // Log warning if data seems wrong (debugging)
      if (storedBuyPrice === 0 || storedBuyPrice === undefined) {
        console.warn(`[SupplyStockPanel] Item ${item.medicineId} has unitPrice=${storedBuyPrice}`);
      }
      
      return {
        medicineId: item.medicineId,
        medicineName: item.medicineName,
        quantity: storedQuantity,           // FROM SUPPLY ORDER
        unitPrice: storedBuyPrice,          // FROM SUPPLY ORDER
        purchasePrice: storedBuyPrice,      // FOR FORM (editable)
        sellingPrice: medicine?.price || 0, // Reference only
        // Use image from supply order item (backend), fallback to medicine lookup
        image: item.medicineImageUrl || medicine?.image,
      };
    });
    
    setFormItems(itemsWithPrices);
    setFormNotes(stock.notes || "");
    setShowForm(true);
  }, [medicines]);

  /**
   * Add medicine to form items
   * 
   * PRICING LOGIC:
   * - purchasePrice: defaults to the SUGGESTED SUPPLIER PRICE, still editable
   * - sellingPrice: read from medicine data, shown for reference only
   *
   * The suggestion works backwards through the markup tiers and applies the bulk
   * discount for the order size, so it is always below the retail price and falls as
   * the quantity rises. It previously defaulted to the SELLING price, which meant every
   * restock was recorded at zero margin.
   */
  const handleAddMedicine = useCallback(() => {
    if (!selectedMedicineId || selectedQuantity <= 0) return;

    const medicine = medicines.find((m) => m.id === selectedMedicineId);
    if (!medicine) return;

    // Check if already added
    if (formItems.some((item) => item.medicineId === selectedMedicineId)) {
      toast.error("Medicine already added - update quantity instead");
      return;
    }

    // Use the admin's entered price when given, otherwise the suggested supplier price
    // for this quantity. Never fall back to the selling price - that implies no margin.
    const purchasePrice =
      selectedPurchasePrice > 0
        ? selectedPurchasePrice
        : suggestion?.suggestedUnitPrice ?? medicine.price;

    // Add item with all required fields including unitPrice
    setFormItems((prev) => [
      ...prev,
      {
        medicineId: selectedMedicineId,
        medicineName: medicine.name,
        quantity: selectedQuantity,
        unitPrice: purchasePrice,       // Required by SupplyStockItem interface
        purchasePrice: purchasePrice,   // What we pay to supplier (editable)
        sellingPrice: medicine.price,   // What we sell to customers (reference only)
        image: medicine.image,
        priceOverridden,                // carry the admin's intent onto the line
      },
    ]);

    // Reset medicine selector for next addition
    setSelectedMedicineId(null);
    setSelectedQuantity(1);
    setSelectedPurchasePrice(0);
    setPriceOverridden(false);
    setMedicineSearch("");
    setShowMedicineDropdown(false);
  }, [selectedMedicineId, selectedQuantity, selectedPurchasePrice, priceOverridden, medicines, formItems, suggestion?.suggestedUnitPrice]);

  /**
   * Change the medicine for an existing item
   * ALLOWED: Only when editing and status === "Created"
   * Updates the medicine, preserves quantity, resets price to new medicine's price
   */
  const handleChangeMedicine = useCallback((oldMedicineId: number, newMedicineId: number) => {
    if (formItems.some((item) => item.medicineId === newMedicineId && item.medicineId !== oldMedicineId)) {
      toast.error("Medicine already in list");
      return;
    }

    const medicine = medicines.find((m) => m.id === newMedicineId);
    if (!medicine) return;

    setFormItems((prev) =>
      prev.map((item) =>
        item.medicineId === oldMedicineId
          ? {
              ...item,
              medicineId: newMedicineId,
              medicineName: medicine.name,
              unitPrice: medicine.price,     // Reset unitPrice when medicine changes
              purchasePrice: medicine.price, // Reset to medicine price as starting point
              sellingPrice: medicine.price,
              image: medicine.image,
            }
          : item
      )
    );
  }, [medicines, formItems]);

  // Remove medicine from form items
  const handleRemoveMedicine = useCallback((medicineId: number) => {
    setFormItems((prev) => prev.filter((item) => item.medicineId !== medicineId));
  }, []);

  /**
   * Update quantity for an item
   * EDITABLE RULE: Only when status === "Created"
   * Automatically recalculates line total (purchasePrice × quantity)
   *
   * Changing the quantity also re-prices the line, because the bulk discount depends
   * on order size - ordering ten times as many and paying the single-unit price would
   * quietly understate the margin on every restock. A line whose price the admin typed
   * themselves is left alone.
   */
  const repriceTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const handleUpdateQuantity = useCallback((medicineId: number, quantity: number) => {
    if (quantity <= 0 || quantity > MAX_ORDER_QUANTITY) return;

    setFormItems((prev) =>
      prev.map((item) =>
        item.medicineId === medicineId ? { ...item, quantity } : item
      )
    );

    // Debounced per line: the quantity box fires on every keystroke.
    const timers = repriceTimers.current;
    clearTimeout(timers.get(medicineId));
    timers.set(
      medicineId,
      setTimeout(async () => {
        timers.delete(medicineId);
        const medicine = medicines.find((m) => m.id === medicineId);
        if (!medicine) return;

        try {
          const result = await suggestPurchasePrice(medicine.price, quantity);
          setFormItems((prev) =>
            prev.map((item) =>
              item.medicineId === medicineId && !item.priceOverridden
                ? { ...item, purchasePrice: result.suggestedUnitPrice, unitPrice: result.suggestedUnitPrice }
                : item
            )
          );
        } catch {
          // Keep the existing price: a failed lookup is no reason to change what the
          // order says it costs.
        }
      }, 400)
    );
  }, [medicines]);

  // Cancel any in-flight re-price when the panel unmounts.
  useEffect(() => {
    const timers = repriceTimers.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  /**
   * Update purchase price for an item
   * EDITABLE RULE: Only when status === "Created"
   * 
   * This is the price paid TO the supplier, which may differ from selling price
   * Common in real pharmacies where wholesale prices vary by supplier
   * 
   * Updates both unitPrice (for backend) and purchasePrice (for UI)
   */
  const handleUpdatePurchasePrice = useCallback((medicineId: number, price: number) => {
    if (price < 0) return;
    setFormItems((prev) =>
      prev.map((item) =>
        item.medicineId === medicineId
          // priceOverridden stops the quantity re-pricing above from replacing a price
          // the admin typed - a negotiated rate must survive a quantity change.
          ? { ...item, unitPrice: price, purchasePrice: price, priceOverridden: true }
          : item
      )
    );
  }, []);

  /**
   * Submit form (create or update)
   * 
   * DATA SAFETY:
   * - Product stock quantities are NOT modified here
   * - Stock updates ONLY occur when status becomes "Stored" (handled by backend)
   * - Purchase prices are stored separately from product selling prices
   */
  const handleSubmitForm = useCallback(async () => {
    if (!formSupplierId) {
      toast.error("Please select a supplier");
      return;
    }
    if (formItems.length === 0) {
      toast.error("Please add at least one medicine");
      return;
    }

    setFormSaving(true);
    try {
      if (editingStock) {
        // UPDATE existing supply stock (only when status === "Created")
        const dto: UpdateSupplyStockDto = {
          supplierId: Number(formSupplierId),
          items: formItems.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            unitPrice: item.purchasePrice, // Store purchase price (supplier cost)
          })),
          notes: formNotes || undefined,
        };
        await updateSupplyStock(editingStock.id, dto);
        toast.success("Supply stock updated");
        onRefresh?.();
      } else {
        // CREATE new supply stock
        // NOTE: This does NOT modify product stock - only when "Stored"
        const dto: CreateSupplyStockDto = {
          supplierId: Number(formSupplierId),
          items: formItems.map((item) => ({
            medicineId: item.medicineId,
            quantity: item.quantity,
            unitPrice: item.purchasePrice, // Store purchase price (supplier cost)
          })),
          notes: formNotes || undefined,
        };
        await onCreateSupplyStock(dto);
        toast.success("Supply stock created");
      }
      resetForm();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Operation failed";
      toast.error(message);
    } finally {
      setFormSaving(false);
    }
  }, [formSupplierId, formItems, formNotes, editingStock, onCreateSupplyStock, onRefresh, resetForm]);

  // ─────────────────────────────────────────────────────────────────────────
  // Status Action Handlers
  // ─────────────────────────────────────────────────────────────────────────
  
  /**
   * Handle status actions (approve, order)
   * Cancel is handled separately via confirmation modal
   */
  const handleStatusAction = useCallback(async (id: number, action: "approve" | "order") => {
    const statusMap = {
      approve: SupplyStockStatus.Approved,
      order: SupplyStockStatus.Ordered,
    };

    setActionLoading(id);
    try {
      await onUpdateStatus(id, statusMap[action]);
      toast.success(`Supply stock ${action}d`);
    } catch (err) {
      const message = err instanceof Error ? err.message : `Failed to ${action}`;
      toast.error(message);
    } finally {
      setActionLoading(null);
    }
  }, [onUpdateStatus]);

  /**
   * Open cancel confirmation modal (FIX 1.4)
   * Shows custom confirmation instead of immediate cancel
   */
  const openCancelConfirmation = useCallback((stock: SupplyStock) => {
    setStockToCancel(stock);
  }, []);

  /**
   * Confirm and execute cancellation
   */
  const confirmCancelOrder = useCallback(async () => {
    if (!stockToCancel) return;
    
    setCancelConfirming(true);
    try {
      await onUpdateStatus(stockToCancel.id, SupplyStockStatus.Cancelled);
      toast.success("Supply order cancelled");
      setStockToCancel(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to cancel order";
      toast.error(message);
    } finally {
      setCancelConfirming(false);
    }
  }, [stockToCancel, onUpdateStatus]);

  /**
   * Confirm and execute deletion (Admin only, Stored/Cancelled orders)
   */
  const confirmDeleteOrder = useCallback(async () => {
    if (!stockToDelete || !onDeleteSupplyStock) return;
    
    setDeleteConfirming(true);
    try {
      await onDeleteSupplyStock(stockToDelete.id);
      toast.success(`Supply order #${stockToDelete.id} deleted`);
      setStockToDelete(null);
      onRefresh?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete order";
      toast.error(message);
    } finally {
      setDeleteConfirming(false);
    }
  }, [stockToDelete, onDeleteSupplyStock, onRefresh]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────

  // Render status badge with proper colors
  const renderStatusBadge = (status: SupplyStockStatus) => {
    const config = SUPPLY_STOCK_STATUS_CONFIG[status] || SUPPLY_STOCK_STATUS_CONFIG[SupplyStockStatus.Created];
    return (
      <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${config.bgColor} ${config.color} ${config.darkBgColor}`}>
        {config.label}
      </span>
    );
  };

  // Render status stepper (visual progress indicator)
  const renderStatusStepper = (currentStatus: SupplyStockStatus) => {
    if (currentStatus === SupplyStockStatus.Cancelled) {
      return (
        <div className="flex items-center gap-1 text-xs text-red-500">
          <X className="h-3 w-3" />
          Cancelled
        </div>
      );
    }

    const steps = [
      SupplyStockStatus.Created,
      SupplyStockStatus.Approved,
      SupplyStockStatus.Ordered,
      SupplyStockStatus.Shipped,
      SupplyStockStatus.Received,
      SupplyStockStatus.Stored,
    ];

    const currentStep = SUPPLY_STOCK_STATUS_CONFIG[currentStatus]?.step || 1;

    return (
      <div className="flex items-center gap-1">
        {steps.map((step, index) => {
          const stepConfig = SUPPLY_STOCK_STATUS_CONFIG[step];
          const isCompleted = stepConfig.step <= currentStep;
          const isCurrent = step === currentStatus;

          return (
            <React.Fragment key={step}>
              <div
                className={`w-2 h-2 rounded-full transition-colors ${
                  isCompleted
                    ? isCurrent
                      ? "bg-purple-600"
                      : "bg-green-500"
                    : darkMode
                    ? "bg-gray-600"
                    : "bg-gray-300"
                }`}
                title={stepConfig.label}
              />
              {index < steps.length - 1 && (
                <div
                  className={`w-3 h-0.5 ${
                    stepConfig.step < currentStep
                      ? "bg-green-500"
                      : darkMode
                      ? "bg-gray-600"
                      : "bg-gray-300"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    );
  };

  // Render action buttons based on current status
  const renderActions = (stock: SupplyStock) => {
    const isLoading = actionLoading === stock.id;
    const status = stock.status;

    // A read-only observer gets no row actions at all - edit, the status steps,
    // cancel and delete every one of them changes an order.
    if (readOnly) return null;

    return (
      <div className="flex items-center gap-2">
        {/* Edit button (only when Created) */}
        {canAdminPerformAction(status, "edit") && (
          <button
            onClick={() => openEditForm(stock)}
            className={`p-1.5 rounded-lg transition-colors ${
              darkMode 
                ? "text-blue-400 hover:bg-blue-900/30" 
                : "text-blue-600 hover:bg-blue-100"
            }`}
            title="Edit supply stock"
          >
            <Edit2 className="h-4 w-4" />
          </button>
        )}

        {/* Approve button */}
        {canAdminPerformAction(status, "approve") && (
          <button
            onClick={() => handleStatusAction(stock.id, "approve")}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "..." : "Approve"}
          </button>
        )}

        {/* Order button */}
        {canAdminPerformAction(status, "order") && (
          <button
            onClick={() => handleStatusAction(stock.id, "order")}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
          >
            {isLoading ? "..." : "Order"}
          </button>
        )}

        {/* Cancel button - opens custom confirmation modal (FIX 1.4) */}
        {canAdminPerformAction(status, "cancel") && (
          <button
            onClick={() => openCancelConfirmation(stock)}
            disabled={isLoading}
            className="px-2.5 py-1 text-xs font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
        )}

        {/* Delete button - Admin can delete Stored or Cancelled orders */}
        {onDeleteSupplyStock && (status === SupplyStockStatus.Stored || status === SupplyStockStatus.Cancelled) && (
          <button
            onClick={() => setStockToDelete(stock)}
            disabled={isLoading}
            title="Delete order permanently"
            className="p-1.5 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────
  /**
   * LAYOUT DECOUPLING:
   * - Panel uses fixed max-height with internal scrolling
   * - This prevents height from affecting adjacent SupplierPanel
   * - min-h-[400px] ensures minimum visibility
   * - max-h-[700px] caps growth to prevent excessive stretching
   * - overflow-hidden on container, overflow-y-auto on content area
   */
  return (
    <div className={`rounded-xl shadow-lg overflow-hidden flex flex-col min-h-[400px] max-h-[700px] ${
      darkMode ? "bg-gray-800" : "bg-white"
    }`}>
      {/* Header - fixed at top */}
      <div className={`px-5 py-4 border-b flex justify-between items-center flex-shrink-0 ${
        darkMode ? "border-gray-700" : "border-gray-200"
      }`}>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Package className="h-5 w-5 text-purple-600" />
          Supply Stocks
          <span className={`text-sm font-normal ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            ({filteredStocks.length})
          </span>
        </h3>
        {!readOnly && (
          <button
            onClick={openCreateForm}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            New Order
          </button>
        )}
      </div>
      {/* Search */}
      <div className={`px-5 py-3 border-b ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
        <div className="relative">
          <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${
            darkMode ? "text-gray-400" : "text-gray-500"
          }`} />
          <input
            type="text"
            placeholder="Search by supplier, medicine, or status..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className={`w-full pl-9 pr-4 py-2.5 text-sm rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
              darkMode 
                ? "bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400" 
                : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
            }`}
          />
        </div>
      </div>

      {/* Create/Edit Form - FIX 1.2: Scrollable with sticky footer */}
      {showForm && (
        <div className={`border-b flex flex-col max-h-[60vh] ${
          darkMode ? "bg-gray-700/50 border-gray-700" : "bg-gray-50 border-gray-200"
        }`}>
          {/* Form Header - sticky at top */}
          <div className={`px-5 py-3 border-b flex-shrink-0 ${darkMode ? "border-gray-600" : "border-gray-300"}`}>
            <h4 className={`font-medium ${darkMode ? "text-gray-200" : "text-gray-800"}`}>
              {editingStock ? "Edit Supply Stock" : "Create New Supply Stock"}
            </h4>
          </div>

          {/* Form Content - scrollable area */}
          <div className="px-5 py-4 overflow-y-auto flex-1">
            {/* Supplier Selection */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                Supplier *
              </label>
              <select
                value={formSupplierId}
                onChange={(e) => setFormSupplierId(e.target.value ? Number(e.target.value) : "")}
                className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                  darkMode 
                    ? "bg-gray-800 border-gray-600 text-gray-100" 
                    : "bg-white border-gray-300"
                }`}
              >
                <option value="">Select Supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* ─────────────────────────────────────────────────────────────────────
                Medicine Selection Row - ALIGNED IN ONE HORIZONTAL ROW
                Layout: [Search Medicine] [Buy $] [Qty] [Add Button]
                Responsive: Wraps on smaller screens, maintains visual balance
                ───────────────────────────────────────────────────────────────────── */}
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                Add Medicines *
              </label>
              {/* Flex container with wrapping for responsiveness */}
              <div className="flex flex-wrap items-end gap-2">
                {/* Medicine Search - takes available space */}
                <div className="flex-1 min-w-[200px] relative">
                  <label className={`block text-xs mb-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                    Medicine
                  </label>
                  <input
                    type="text"
                    placeholder="Search medicines..."
                    value={medicineSearch}
                    onChange={(e) => {
                      setMedicineSearch(e.target.value);
                      setShowMedicineDropdown(true);
                  }}
                  onFocus={() => setShowMedicineDropdown(true)}
                  className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                    darkMode 
                      ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                      : "bg-white border-gray-300 placeholder-gray-500"
                  }`}
                />
                
                {/* Medicine Dropdown */}
                {showMedicineDropdown && filteredMedicines.length > 0 && (
                  <div className={`absolute z-10 mt-1 w-full max-h-60 overflow-auto rounded-lg border shadow-lg ${
                    darkMode ? "bg-gray-800 border-gray-600" : "bg-white border-gray-200"
                  }`}>
                    {filteredMedicines.map((medicine) => {
                      // Build proper image URL - handles relative paths from backend
                      const imageUrl = buildImageUrl(medicine.image);
                      const isLowStock = medicine.stock < LOW_STOCK_THRESHOLD;
                      
                      return (
                        <button
                          key={medicine.id}
                          type="button"
                          onClick={() => {
                            setSelectedMedicineId(medicine.id);
                            setMedicineSearch(medicine.name);
                            // Default purchase price to medicine selling price
                            setSelectedPurchasePrice(medicine.price);
                            setShowMedicineDropdown(false);
                          }}
                          className={`w-full px-3 py-2 text-left flex items-center gap-3 transition-colors ${
                            selectedMedicineId === medicine.id
                              ? darkMode ? "bg-purple-900/30" : "bg-purple-50"
                              : darkMode ? "hover:bg-gray-700" : "hover:bg-gray-100"
                          }`}
                        >
                          {/* Medicine Image - uses same URL logic as ProductCard */}
                          <div className={`w-10 h-10 rounded-lg overflow-hidden flex-shrink-0 ${
                            darkMode ? "bg-gray-700" : "bg-gray-100"
                          }`}>
                            {imageUrl ? (
                              <img 
                                src={imageUrl} 
                                alt={medicine.name}
                                className="w-full h-full object-contain"
                                onError={(e) => {
                                  // Fallback on image load error
                                  e.currentTarget.style.display = 'none';
                                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                }}
                              />
                            ) : null}
                            <div className={`w-full h-full flex items-center justify-center ${imageUrl ? 'hidden' : ''}`}>
                              <Package className={`h-5 w-5 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
                            </div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium truncate ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                              {medicine.name}
                            </div>
                            <div className={`text-xs flex items-center gap-2 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                              <span className={isLowStock ? "text-amber-500 font-medium" : ""}>
                                Stock: {medicine.stock}
                                {isLowStock && " ⚠️"}
                              </span>
                              <span>•</span>
                              <span className="text-blue-600 dark:text-blue-400">Sell: ${medicine.price.toFixed(2)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              
              {/* Purchase Price Input */}
              <div className="flex flex-col">
                <label className={`text-xs mb-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Buy $
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={selectedPurchasePrice || ""}
                  onChange={(e) => {
                    setSelectedPurchasePrice(parseFloat(e.target.value) || 0);
                    // From here on this is the admin's number, not the suggestion's.
                    setPriceOverridden(true);
                  }}
                  aria-label="Purchase price"
                  placeholder={suggestion ? suggestion.suggestedUnitPrice.toFixed(2) : "Price"}
                  className={`w-24 px-2 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                    darkMode
                      ? "bg-gray-800 border-gray-600 text-gray-100"
                      : "bg-white border-gray-300"
                  }`}
                />
                {suggestion && (
                  priceOverridden ? (
                    // Only offered once the admin has departed from it - the field is
                    // prefilled with the suggestion otherwise, so there is nothing to apply.
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedPurchasePrice(suggestion.suggestedUnitPrice);
                        setPriceOverridden(false);
                      }}
                      title={
                        `Sells for $${suggestion.sellPrice.toFixed(2)}. ` +
                        `Suggested supplier price $${suggestion.basePurchasePrice.toFixed(2)}` +
                        (suggestion.volumeDiscountPercent > 0
                          ? `, less ${suggestion.volumeDiscountPercent}% bulk discount at ${suggestion.quantity} units ` +
                            `= $${suggestion.suggestedUnitPrice.toFixed(2)} (saves $${suggestion.savingsVsBase.toFixed(2)}).`
                          : ".") +
                        " Click to go back to it."
                      }
                      className="text-[10px] mt-0.5 text-purple-500 hover:text-purple-400 text-left leading-tight"
                    >
                      reset to ${suggestion.suggestedUnitPrice.toFixed(2)}
                      {suggestion.volumeDiscountPercent > 0 && (
                        <span className="text-emerald-500"> −{suggestion.volumeDiscountPercent}%</span>
                      )}
                    </button>
                  ) : (
                    <span
                      className="text-[10px] mt-0.5 text-gray-400 text-left leading-tight"
                      title={
                        `Sells for $${suggestion.sellPrice.toFixed(2)}. ` +
                        `Suggested supplier price $${suggestion.basePurchasePrice.toFixed(2)}` +
                        (suggestion.volumeDiscountPercent > 0
                          ? `, less ${suggestion.volumeDiscountPercent}% bulk discount at ${suggestion.quantity} units.`
                          : ".")
                      }
                    >
                      suggested
                      {suggestion.volumeDiscountPercent > 0 && (
                        <span className="text-emerald-500"> −{suggestion.volumeDiscountPercent}%</span>
                      )}
                    </span>
                  )
                )}
              </div>

              {/* Quantity Input */}
              <div className="flex flex-col">
                <label className={`text-xs mb-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Qty
                </label>
                <input
                  type="number"
                  min="1"
                  max={MAX_ORDER_QUANTITY}
                  value={selectedQuantity}
                  aria-label="Order quantity"
                  onChange={(e) =>
                    // Clamped rather than validated after the fact: a quantity beyond
                    // this could not be priced at all, and the form silently lost the
                    // suggested price instead of saying why.
                    setSelectedQuantity(
                      Math.min(MAX_ORDER_QUANTITY, Math.max(1, parseInt(e.target.value) || 1))
                    )
                  }
                  placeholder="Qty"
                  className={`w-20 px-2 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                    darkMode
                      ? "bg-gray-800 border-gray-600 text-gray-100"
                      : "bg-white border-gray-300"
                  }`}
                />
                {selectedQuantity >= MAX_ORDER_QUANTITY && (
                  <span className="text-[10px] mt-0.5 text-amber-500 leading-tight">
                    max {MAX_ORDER_QUANTITY.toLocaleString()}
                  </span>
                )}
              </div>
              
              {/* Add Button - self-aligns to bottom of row */}
              <button
                type="button"
                onClick={handleAddMedicine}
                disabled={!selectedMedicineId || selectedQuantity <= 0}
                className="px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors self-end"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Selected Items List - Card layout with purchase/selling price distinction */}
          {formItems.length > 0 && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <label className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                  Selected Items ({formItemCount})
                </label>
                {/* Summary: Total Cost (Purchase Price × Qty) */}
                <div className={`text-sm font-semibold flex items-center gap-1 ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                  <DollarSign className="h-4 w-4" />
                  Total Cost: ${formTotalCost.toFixed(2)}
                </div>
              </div>
              
              {/* Items Cards - shows purchase price (editable) and selling price (reference) */}
              <div className="space-y-3">
                {formItems.map((item) => {
                  // Build image URL for each item
                  const itemImageUrl = buildImageUrl(item.image);
                  // Calculate line total: purchase price × quantity (cost to pharmacy)
                  const lineTotal = item.purchasePrice * item.quantity;

                  return (
                    <div 
                      key={item.medicineId} 
                      className={`rounded-lg border p-3 ${
                        darkMode 
                          ? "bg-gray-700/50 border-gray-600" 
                          : "bg-white border-gray-200 shadow-sm"
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        {/* Medicine Image */}
                        <div className={`w-14 h-14 rounded-lg overflow-hidden flex-shrink-0 ${
                          darkMode ? "bg-gray-600" : "bg-gray-100"
                        }`}>
                          {itemImageUrl ? (
                            <img 
                              src={itemImageUrl} 
                              alt={item.medicineName}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                e.currentTarget.nextElementSibling?.classList.remove('hidden');
                              }}
                            />
                          ) : null}
                          <div className={`w-full h-full flex items-center justify-center ${itemImageUrl ? 'hidden' : ''}`}>
                            <Package className={`h-6 w-6 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
                          </div>
                        </div>

                        {/* Item Details */}
                        <div className="flex-1 min-w-0">
                          {/* Medicine Name with Remove Option */}
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <h4 className={`font-medium truncate ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                              {item.medicineName}
                            </h4>
                            {/* Remove Button */}
                            <button
                              type="button"
                              onClick={() => handleRemoveMedicine(item.medicineId)}
                              className={`p-1.5 rounded-lg transition-colors flex-shrink-0 ${
                                darkMode 
                                  ? "text-red-400 hover:bg-red-900/30" 
                                  : "text-red-500 hover:bg-red-100"
                              }`}
                              title="Remove item"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>

                          {/* Price & Quantity Row - Purchase price editable, Selling price for reference */}
                          <div className="flex items-end justify-between gap-4 flex-wrap">
                            <div className="flex items-center gap-4">
                              {/* Purchase Price (editable) - what pharmacy pays to supplier */}
                              <div>
                                <label className={`block text-xs mb-0.5 ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                                  Buy $ (cost)
                                </label>
                                <input
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={item.purchasePrice}
                                  onChange={(e) => handleUpdatePurchasePrice(item.medicineId, parseFloat(e.target.value) || 0)}
                                  className={`w-24 px-2 py-1 text-sm rounded-lg border text-center ${
                                    darkMode 
                                      ? "bg-gray-600 border-gray-500 text-blue-300" 
                                      : "bg-blue-50 border-blue-200 text-blue-700"
                                  }`}
                                />
                              </div>

                              {/* Selling Price (read-only) - what customer pays */}
                              <div>
                                <label className={`block text-xs mb-0.5 ${darkMode ? "text-green-400" : "text-green-600"}`}>
                                  Sell $ (retail)
                                </label>
                                <span className={`inline-block w-20 px-2 py-1 text-sm rounded-lg text-center ${
                                  darkMode 
                                    ? "bg-gray-600/50 text-green-400" 
                                    : "bg-green-50 text-green-700"
                                }`}>
                                  ${item.sellingPrice.toFixed(2)}
                                </span>
                              </div>

                              {/* Quantity Selector */}
                              <div>
                                <label className={`block text-xs mb-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                  Quantity
                                </label>
                                <input
                                  type="number"
                                  min="1"
                                  max={MAX_ORDER_QUANTITY}
                                  value={item.quantity}
                                  aria-label={`Quantity for ${item.medicineName}`}
                                  onChange={(e) =>
                                    handleUpdateQuantity(
                                      item.medicineId,
                                      Math.min(MAX_ORDER_QUANTITY, parseInt(e.target.value) || 1)
                                    )
                                  }
                                  className={`w-20 px-2 py-1 text-sm rounded-lg border text-center ${
                                    darkMode 
                                      ? "bg-gray-600 border-gray-500 text-gray-100" 
                                      : "bg-gray-50 border-gray-300"
                                  }`}
                                />
                              </div>
                            </div>

                            {/* Line Total - based on purchase price */}
                            <div className="text-right">
                              <label className={`block text-xs mb-0.5 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                Line cost
                              </label>
                              <span className={`text-sm font-semibold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                                ${lineTotal.toFixed(2)}
                              </span>
                            </div>
                          </div>

                          {/* Change Medicine Dropdown - for editing selected medicine */}
                          <div className="mt-2">
                            <select
                              value={item.medicineId}
                              onChange={(e) => handleChangeMedicine(item.medicineId, parseInt(e.target.value))}
                              className={`w-full text-xs px-2 py-1.5 rounded-lg border ${
                                darkMode 
                                  ? "bg-gray-600 border-gray-500 text-gray-200" 
                                  : "bg-gray-50 border-gray-300"
                              }`}
                            >
                              <option value={item.medicineId}>{item.medicineName}</option>
                              {medicines
                                .filter((m) => m.id !== item.medicineId && !formItems.some((fi) => fi.medicineId === m.id))
                                .map((m) => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} - Sell: ${m.price.toFixed(2)}
                                  </option>
                                ))
                              }
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Grand Total Summary - shows total cost to pharmacy */}
              <div className={`mt-3 p-3 rounded-lg ${darkMode ? "bg-gray-700" : "bg-gray-100"}`}>
                <div className="flex items-center justify-between">
                  <span className={`font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Order Summary
                  </span>
                  <div className="text-right">
                    <div className={`text-xs ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                      {formItemCount} item{formItemCount !== 1 ? 's' : ''}
                    </div>
                    <div className={`text-lg font-bold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                      Total Cost: ${formTotalCost.toFixed(2)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mb-4">
            <label className={`block text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
              Notes (optional)
            </label>
            <textarea
              value={formNotes}
              onChange={(e) => setFormNotes(e.target.value)}
              rows={2}
              className={`w-full px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                darkMode 
                  ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                  : "bg-white border-gray-300 placeholder-gray-500"
              }`}
              placeholder="Add any notes..."
            />
          </div>
          </div>

          {/* Form Actions - FIX 1.2: Sticky footer always visible */}
          <div className={`px-5 py-3 border-t flex gap-2 flex-shrink-0 ${
            darkMode ? "border-gray-600 bg-gray-700/80" : "border-gray-300 bg-gray-100"
          }`}>
            <button
              onClick={handleSubmitForm}
              disabled={formSaving || !formSupplierId || formItems.length === 0}
              className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors font-medium"
            >
              {formSaving ? "Saving..." : editingStock ? "Update Order" : "Create Order"}
            </button>
            <button
              onClick={resetForm}
              className={`px-4 py-2 rounded-lg transition-colors font-medium ${
                darkMode ? "bg-gray-600 hover:bg-gray-500 text-gray-200" : "bg-gray-200 hover:bg-gray-300 text-gray-700"
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Supply Stocks List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="px-5 py-8 text-center text-gray-500">Loading supply stocks...</div>
        ) : filteredStocks.length === 0 ? (
          <div className="px-5 py-8 text-center text-gray-500">
            {debouncedSearch ? "No supply stocks match your search." : "No active supply stocks. Create your first order!"}
          </div>
        ) : (
          <div className={`divide-y ${darkMode ? "divide-gray-700" : "divide-gray-200"}`}>
            {paginatedStocks.map((stock) => (
              <div key={stock.id} className={`transition-colors ${
                darkMode ? "hover:bg-gray-700/50" : "hover:bg-gray-50"
              }`}>
                {/* Main Row */}
                <div className="px-5 py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Header: ID, Supplier, Status */}
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-medium ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                          #{stock.id}
                        </span>
                        <span className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                          {stock.supplierName || `Supplier #${stock.supplierId}`}
                        </span>
                        {renderStatusBadge(stock.status)}
                      </div>

                      {/* Date & Items Count */}
                      <div className={`mt-1 flex items-center gap-3 text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3.5 w-3.5" />
                          {formatDate(stock.createdAt)}
                        </span>
                        <span>•</span>
                        <span>{stock.items?.length || 0} items</span>
                        {stock.orderedAt && (
                          <>
                            <span>•</span>
                            <span>Ordered: {formatDate(stock.orderedAt)}</span>
                          </>
                        )}
                      </div>

                      {/* Status Stepper */}
                      <div className="mt-2">
                        {renderStatusStepper(stock.status)}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {renderActions(stock)}
                      
                      {/* Expand/Collapse */}
                      <button
                        onClick={() => setExpandedId(expandedId === stock.id ? null : stock.id)}
                        className={`p-1.5 rounded-lg transition-colors ${
                          darkMode 
                            ? "text-gray-400 hover:bg-gray-700" 
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform ${
                          expandedId === stock.id ? "rotate-180" : ""
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details - Shows items with TOTAL PRICE CALCULATION */}
                {expandedId === stock.id && (
                  <div className={`px-5 pb-4 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
                    <div className={`rounded-lg p-3 ${darkMode ? "bg-gray-700/50" : "bg-gray-100"}`}>
                      {/* ─────────────────────────────────────────────────────────────
                          SUPPLY ORDER DETAILS VIEW
                          Data comes directly from backend SupplyOrderItemDto:
                          - item.medicineName = Medicine.Name
                          - item.unitPrice = BUY price stored with supply order
                          - item.quantity = ordered quantity
                          
                          Total = sum of (unitPrice × quantity) for all items
                          ───────────────────────────────────────────────────────────── */}
                      <div className="flex items-center justify-between mb-3">
                        <h5 className={`text-sm font-medium ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                          Order Items
                        </h5>
                        {/* Total Items and Price Summary - calculated from backend data */}
                        <div className={`text-sm font-semibold ${darkMode ? "text-blue-400" : "text-blue-600"}`}>
                          {stock.items?.length || 0} Item{(stock.items?.length || 0) !== 1 ? 's' : ''} — Total: $
                          {(stock.items?.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0) || 0).toFixed(2)}
                        </div>
                      </div>
                      
                      {/* Items List - shows image, medicineName, unitPrice, quantity from backend */}
                      <div className="space-y-2">
                        {stock.items?.map((item, idx) => {
                          // Data comes directly from backend SupplyOrderItemDto
                          // unitPrice is the BUY price, NOT the retail/sell price
                          const lineTotal = item.unitPrice * item.quantity;
                          // Build image URL from backend medicineImageUrl
                          const imageUrl = buildImageUrl(item.medicineImageUrl);
                          return (
                            <div key={idx} className={`flex justify-between items-center text-sm py-1 ${
                              darkMode ? "text-gray-300 border-b border-gray-600 last:border-0" : "text-gray-600 border-b border-gray-200 last:border-0"
                            }`}>
                              {/* Medicine image and name from backend */}
                              <div className="flex items-center gap-2 flex-1">
                                <div className={`w-8 h-8 rounded overflow-hidden flex-shrink-0 ${
                                  darkMode ? "bg-gray-600" : "bg-gray-200"
                                }`}>
                                  {imageUrl ? (
                                    <img 
                                      src={imageUrl} 
                                      alt={item.medicineName}
                                      className="w-full h-full object-contain"
                                      onError={(e) => {
                                        e.currentTarget.style.display = 'none';
                                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                                      }}
                                    />
                                  ) : null}
                                  <div className={`w-full h-full flex items-center justify-center ${imageUrl ? 'hidden' : ''}`}>
                                    <Package className={`h-4 w-4 ${darkMode ? "text-gray-500" : "text-gray-400"}`} />
                                  </div>
                                </div>
                                <span>{item.medicineName}</span>
                              </div>
                              {/* Unit price (BUY) and quantity from backend */}
                              <span className={`mx-4 ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                                ${item.unitPrice.toFixed(2)} × {item.quantity}
                              </span>
                              {/* Calculated line total */}
                              <span className="font-medium min-w-[70px] text-right">
                                ${lineTotal.toFixed(2)}
                              </span>
                            </div>
                          );
                        })}
                        {(!stock.items || stock.items.length === 0) && (
                          <div className={`text-sm italic ${darkMode ? "text-gray-500" : "text-gray-400"}`}>
                            No items
                          </div>
                        )}
                      </div>
                      
                      {/* Notes */}
                      {stock.notes && (
                        <div className="mt-3 pt-3 border-t border-gray-600">
                          <h5 className={`text-sm font-medium mb-1 ${darkMode ? "text-gray-300" : "text-gray-700"}`}>
                            Notes
                          </h5>
                          <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-600"}`}>
                            {stock.notes}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className={`px-5 py-3 border-t flex items-center justify-between ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}>
          <span className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
            Page {currentPage} of {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                darkMode 
                  ? "text-gray-400 hover:bg-gray-700 disabled:hover:bg-transparent" 
                  : "text-gray-500 hover:bg-gray-100 disabled:hover:bg-transparent"
              }`}
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                darkMode 
                  ? "text-gray-400 hover:bg-gray-700 disabled:hover:bg-transparent" 
                  : "text-gray-500 hover:bg-gray-100 disabled:hover:bg-transparent"
              }`}
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────────────
          CANCEL CONFIRMATION MODAL (FIX 1.4)
          Custom modal for cancelling supply orders with clear warning
          ───────────────────────────────────────────────────────────────────── */}
      {stockToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className={`w-full max-w-md rounded-xl shadow-2xl ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center gap-3 ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-full">
                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className={`text-lg font-semibold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                  Cancel Supply Order
                </h3>
                <p className={`text-sm ${darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Order #{stockToCancel.id}
                </p>
              </div>
            </div>

            {/* Modal Content */}
            <div className="px-6 py-4">
              {/* Order Summary */}
              <div className={`mb-4 p-3 rounded-lg ${darkMode ? "bg-gray-700/50" : "bg-gray-100"}`}>
                <div className={`text-sm ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  <div className="flex justify-between mb-1">
                    <span>Supplier:</span>
                    <span className="font-medium">{stockToCancel.supplierName || `#${stockToCancel.supplierId}`}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Items:</span>
                    <span className="font-medium">{stockToCancel.items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Status:</span>
                    <span className="font-medium">{stockToCancel.status}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      ${(stockToCancel.items?.reduce((sum, item) => sum + ((item.unitPrice || 0) * item.quantity), 0) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning Message */}
              <div className={`p-3 rounded-lg border ${
                darkMode 
                  ? "bg-red-900/20 border-red-800 text-red-300" 
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                <p className="text-sm font-medium mb-1">⚠️ This action cannot be undone</p>
                <p className="text-xs opacity-90">
                  Cancelling this supply order will permanently mark it as cancelled. 
                  The order will no longer be processable and inventory will not be affected.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-end ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <button
                onClick={() => setStockToCancel(null)}
                disabled={cancelConfirming}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode 
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200" 
                    : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                }`}
              >
                Back
              </button>
              <button
                onClick={confirmCancelOrder}
                disabled={cancelConfirming}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {cancelConfirming ? "Cancelling..." : "Confirm Cancel"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {stockToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className={`w-full max-w-md rounded-xl shadow-xl ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            {/* Modal Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-full bg-red-100 dark:bg-red-900/30">
                  <Trash2 className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <h3 className="text-lg font-semibold">Delete Supply Order</h3>
              </div>
              <button
                onClick={() => setStockToDelete(null)}
                className={`p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-6 py-5 space-y-4">
              {/* Order Details */}
              <div>
                <p className={`text-sm mb-3 ${darkMode ? "text-gray-300" : "text-gray-600"}`}>
                  Are you sure you want to permanently delete this supply order?
                </p>
                <div className={`rounded-lg p-4 ${darkMode ? "bg-gray-700" : "bg-gray-100"}`}>
                  <div className="flex justify-between mb-1">
                    <span>Order #:</span>
                    <span className="font-medium">{stockToDelete.id}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Supplier:</span>
                    <span className="font-medium">{stockToDelete.supplierName}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Status:</span>
                    <span className="font-medium">{stockToDelete.status}</span>
                  </div>
                  <div className="flex justify-between mb-1">
                    <span>Items:</span>
                    <span className="font-medium">{stockToDelete.items?.length || 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total:</span>
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      ${(stockToDelete.items?.reduce((sum, item) => sum + ((item.unitPrice || 0) * item.quantity), 0) || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Warning Message */}
              <div className={`p-3 rounded-lg border ${
                darkMode 
                  ? "bg-red-900/20 border-red-800 text-red-300" 
                  : "bg-red-50 border-red-200 text-red-700"
              }`}>
                <p className="text-sm font-medium mb-1">⚠️ This action is permanent</p>
                <p className="text-xs opacity-90">
                  This order will be permanently deleted from the database.
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-end ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <button
                onClick={() => setStockToDelete(null)}
                disabled={deleteConfirming}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  darkMode 
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200" 
                    : "bg-gray-200 hover:bg-gray-300 text-gray-800"
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteOrder}
                disabled={deleteConfirming}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {deleteConfirming ? "Deleting..." : "Delete Order"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SupplyStockPanel;
