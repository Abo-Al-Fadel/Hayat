// src/Components/dashboard/SupplierPanel.tsx
import React, { useState, useMemo, useCallback } from "react";
import { Truck, Plus, Search, Mail, Phone, MapPin, Trash2, Pencil, X, Save, AlertCircle } from "lucide-react";
import { type Supplier, type UpdateSupplierDto } from "../../Services/SupplierService";
import { DeleteConfirmModal } from "../ui/DeleteConfirmModal";

interface SupplierPanelProps {
  suppliers: Supplier[];
  loading: boolean;
  darkMode: boolean;
  onAddSupplier: (supplier: Omit<Supplier, "id">) => Promise<void>;
  onEditSupplier: (id: number, data: UpdateSupplierDto) => Promise<Supplier>;
  onDeleteSupplier: (id: number) => Promise<void>;
}

// Validation helpers
const isValidEmail = (email: string): boolean => {
  if (!email.trim()) return true; // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone: string): boolean => {
  if (!phone.trim()) return true; // Empty is valid (optional field)
  // Phone can contain digits, spaces, hyphens, plus sign, and parentheses
  const phoneRegex = /^[\d\s\-+()]+$/;
  return phoneRegex.test(phone) && phone.replace(/[\s\-+()]/g, "").length >= 7;
};

/**
 * SupplierPanel - Manages supplier list
 * 
 * Features:
 * - Display suppliers in clean card layout
 * - Search/filter suppliers by name or contact info
 * - Add new suppliers
 * - Edit supplier name, email, phone via modal
 * - Delete suppliers with custom confirmation modal
 */
export function SupplierPanel({
  suppliers,
  loading,
  darkMode,
  onAddSupplier,
  onEditSupplier,
  onDeleteSupplier,
}: SupplierPanelProps) {
  // Search state
  const [searchTerm, setSearchTerm] = useState("");
  
  // Add form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [newSupplier, setNewSupplier] = useState<Omit<Supplier, "id">>({
    name: "",
    email: "",
    phone: "",
    address: "",
    contactInfo: "",
  });
  const [saving, setSaving] = useState(false);

  // Edit modal state
  const [editTarget, setEditTarget] = useState<Supplier | null>(null);
  const [editForm, setEditForm] = useState<UpdateSupplierDto>({ name: "", email: "", phone: "" });
  const [editErrors, setEditErrors] = useState<{ name?: string; email?: string; phone?: string }>({});
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Filter suppliers based on search
  const filteredSuppliers = useMemo(() => {
    if (!searchTerm.trim()) return suppliers;
    
    const term = searchTerm.toLowerCase();
    return suppliers.filter((supplier) => {
      const nameMatch = supplier.name.toLowerCase().includes(term);
      const emailMatch = supplier.email?.toLowerCase().includes(term);
      const phoneMatch = supplier.phone?.toLowerCase().includes(term);
      const contactMatch = supplier.contactInfo?.toLowerCase().includes(term);
      return nameMatch || emailMatch || phoneMatch || contactMatch;
    });
  }, [suppliers, searchTerm]);

  // Handle add supplier
  const handleAdd = useCallback(async () => {
    if (!newSupplier.name.trim()) return;

    setSaving(true);
    try {
      await onAddSupplier(newSupplier);
      
      // Reset form
      setShowAddForm(false);
      setNewSupplier({
        name: "",
        email: "",
        phone: "",
        address: "",
        contactInfo: "",
      });
    } finally {
      setSaving(false);
    }
  }, [newSupplier, onAddSupplier]);

  // Handle delete confirmation
  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;

    setDeleting(true);
    try {
      await onDeleteSupplier(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, onDeleteSupplier]);

  // Open edit modal
  const openEditModal = useCallback((supplier: Supplier) => {
    setEditTarget(supplier);
    setEditForm({
      name: supplier.name,
      email: supplier.email || "",
      phone: supplier.phone || "",
    });
    setEditErrors({});
  }, []);

  // Close edit modal
  const closeEditModal = useCallback(() => {
    setEditTarget(null);
    setEditForm({ name: "", email: "", phone: "" });
    setEditErrors({});
  }, []);

  // Validate edit form
  const validateEditForm = useCallback((): boolean => {
    const errors: { name?: string; email?: string; phone?: string } = {};
    
    if (!editForm.name.trim()) {
      errors.name = "Name is required";
    }
    
    if (editForm.email && !isValidEmail(editForm.email)) {
      errors.email = "Invalid email format";
    }
    
    if (editForm.phone && !isValidPhone(editForm.phone)) {
      errors.phone = "Invalid phone format";
    }
    
    setEditErrors(errors);
    return Object.keys(errors).length === 0;
  }, [editForm]);

  // Handle edit save
  const handleEditSave = useCallback(async () => {
    if (!editTarget || !validateEditForm()) return;

    setEditSaving(true);
    try {
      await onEditSupplier(editTarget.id, {
        name: editForm.name.trim(),
        email: editForm.email?.trim() || undefined,
        phone: editForm.phone?.trim() || undefined,
      });
      closeEditModal();
    } finally {
      setEditSaving(false);
    }
  }, [editTarget, editForm, validateEditForm, onEditSupplier, closeEditModal]);

  /**
   * LAYOUT DECOUPLING:
   * - Panel uses fixed max-height with internal scrolling
   * - This prevents height from affecting adjacent SupplyStockPanel
   * - min-h-[400px] ensures minimum visibility
   * - max-h-[700px] caps growth to prevent excessive stretching
   * - Independent scrolling area for supplier list
   */
  return (
    <>
      <div className={`rounded-xl shadow-lg overflow-hidden flex flex-col min-h-[400px] max-h-[700px] ${
        darkMode ? "bg-gray-800" : "bg-white"
      }`}>
        {/* Header - fixed at top */}
        <div className={`px-5 py-4 border-b flex justify-between items-center flex-shrink-0 ${
          darkMode ? "border-gray-700" : "border-gray-200"
        }`}>
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Truck className="h-5 w-5 text-purple-600" />
            Suppliers
          </h3>
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white bg-purple-600 rounded-lg hover:bg-purple-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Add Supplier
          </button>
        </div>

        {/* Search - fixed below header */}
        <div className={`px-5 py-3 border-b flex-shrink-0 ${darkMode ? "border-gray-700" : "border-gray-200"}`}>
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 ${
              darkMode ? "text-gray-400" : "text-gray-500"
            }`} />
            <input
              type="text"
              placeholder="Search by name, email, or phone..."
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

        {/* Add Form */}
        {showAddForm && (
          <div className={`px-5 py-4 border-b flex-shrink-0 ${
            darkMode ? "bg-gray-700/50 border-gray-700" : "bg-gray-50 border-gray-200"
          }`}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Supplier Name *"
                value={newSupplier.name}
                onChange={(e) => setNewSupplier((prev) => ({ ...prev, name: e.target.value }))}
                className={`px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                  darkMode 
                    ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                    : "bg-white border-gray-300 placeholder-gray-500"
                }`}
              />
              <input
                type="email"
                placeholder="Email"
                value={newSupplier.email}
                onChange={(e) => setNewSupplier((prev) => ({ ...prev, email: e.target.value }))}
                className={`px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                  darkMode 
                    ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                    : "bg-white border-gray-300 placeholder-gray-500"
                }`}
              />
              <input
                type="tel"
                placeholder="Phone"
                value={newSupplier.phone}
                onChange={(e) => setNewSupplier((prev) => ({ ...prev, phone: e.target.value }))}
                className={`px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                  darkMode 
                    ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                    : "bg-white border-gray-300 placeholder-gray-500"
                }`}
              />
              <input
                type="text"
                placeholder="Address"
                value={newSupplier.address}
                onChange={(e) => setNewSupplier((prev) => ({ ...prev, address: e.target.value }))}
                className={`px-3 py-2 rounded-lg border focus:ring-2 focus:ring-purple-500 ${
                  darkMode 
                    ? "bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-400" 
                    : "bg-white border-gray-300 placeholder-gray-500"
                }`}
              />
            </div>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAdd}
                disabled={saving || !newSupplier.name.trim()}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {saving ? "Adding..." : "Add Supplier"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setNewSupplier({
                    name: "",
                    email: "",
                    phone: "",
                    address: "",
                    contactInfo: "",
                  });
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode ? "bg-gray-600 hover:bg-gray-500" : "bg-gray-200 hover:bg-gray-300"
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="px-5 py-8 text-center text-gray-500">Loading suppliers...</div>
          ) : filteredSuppliers.length === 0 ? (
            <div className="px-5 py-8 text-center text-gray-500">
              {searchTerm ? "No suppliers match your search." : "No suppliers found. Add your first supplier!"}
            </div>
          ) : (
            <div className={`divide-y ${darkMode ? "divide-gray-700" : "divide-gray-200"}`}>
              {filteredSuppliers.map((supplier) => (
                <div 
                  key={supplier.id} 
                  className={`px-5 py-4 transition-colors ${
                    darkMode ? "hover:bg-gray-700/50" : "hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Supplier Name */}
                      <h4 className={`font-semibold truncate ${
                        darkMode ? "text-gray-100" : "text-gray-900"
                      }`}>
                        {supplier.name}
                      </h4>
                      
                      {/* Contact Info */}
                      <div className="mt-2 space-y-1">
                        {supplier.email && (
                          <div className={`flex items-center gap-2 text-sm ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}>
                            <Mail className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{supplier.email}</span>
                          </div>
                        )}
                        {supplier.phone && (
                          <div className={`flex items-center gap-2 text-sm ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}>
                            <Phone className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>{supplier.phone}</span>
                          </div>
                        )}
                        {supplier.address && (
                          <div className={`flex items-center gap-2 text-sm ${
                            darkMode ? "text-gray-400" : "text-gray-500"
                          }`}>
                            <MapPin className="h-3.5 w-3.5 flex-shrink-0" />
                            <span className="truncate">{supplier.address}</span>
                          </div>
                        )}
                        {!supplier.email && !supplier.phone && !supplier.address && (
                          <div className={`text-sm italic ${
                            darkMode ? "text-gray-500" : "text-gray-400"
                          }`}>
                            No contact information
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="ml-3 flex items-center gap-1">
                      {/* Edit Button */}
                      <button
                        onClick={() => openEditModal(supplier)}
                        className={`p-2 rounded-lg transition-colors ${
                          darkMode 
                            ? "text-blue-400 hover:bg-blue-900/30" 
                            : "text-blue-500 hover:bg-blue-100"
                        }`}
                        title="Edit supplier"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      
                      {/* Delete Button */}
                      <button
                        onClick={() => setDeleteTarget(supplier)}
                        className={`p-2 rounded-lg transition-colors ${
                          darkMode 
                            ? "text-red-400 hover:bg-red-900/30" 
                            : "text-red-500 hover:bg-red-100"
                        }`}
                        title="Delete supplier"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Supplier Modal */}
      {editTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className={`w-full max-w-md mx-4 rounded-xl shadow-2xl overflow-hidden ${
            darkMode ? "bg-gray-800" : "bg-white"
          }`}>
            {/* Modal Header */}
            <div className={`px-5 py-4 border-b flex items-center justify-between ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <h3 className={`text-lg font-semibold ${darkMode ? "text-gray-100" : "text-gray-900"}`}>
                Edit Supplier
              </h3>
              <button
                onClick={closeEditModal}
                className={`p-1.5 rounded-lg transition-colors ${
                  darkMode ? "hover:bg-gray-700 text-gray-400" : "hover:bg-gray-100 text-gray-500"
                }`}
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="px-5 py-4 space-y-4">
              {/* Name Field */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? "text-gray-300" : "text-gray-700"
                }`}>
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, name: e.target.value }));
                    if (editErrors.name) setEditErrors((prev) => ({ ...prev, name: undefined }));
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    editErrors.name 
                      ? "border-red-500" 
                      : darkMode ? "border-gray-600" : "border-gray-300"
                  } ${
                    darkMode 
                      ? "bg-gray-700 text-gray-100 placeholder-gray-400" 
                      : "bg-white text-gray-900 placeholder-gray-500"
                  }`}
                  placeholder="Enter supplier name"
                />
                {editErrors.name && (
                  <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {editErrors.name}
                  </div>
                )}
              </div>

              {/* Email Field */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? "text-gray-300" : "text-gray-700"
                }`}>
                  Email
                </label>
                <input
                  type="email"
                  value={editForm.email}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, email: e.target.value }));
                    if (editErrors.email) setEditErrors((prev) => ({ ...prev, email: undefined }));
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    editErrors.email 
                      ? "border-red-500" 
                      : darkMode ? "border-gray-600" : "border-gray-300"
                  } ${
                    darkMode 
                      ? "bg-gray-700 text-gray-100 placeholder-gray-400" 
                      : "bg-white text-gray-900 placeholder-gray-500"
                  }`}
                  placeholder="Enter email address"
                />
                {editErrors.email && (
                  <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {editErrors.email}
                  </div>
                )}
              </div>

              {/* Phone Field */}
              <div>
                <label className={`block text-sm font-medium mb-1.5 ${
                  darkMode ? "text-gray-300" : "text-gray-700"
                }`}>
                  Phone
                </label>
                <input
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => {
                    setEditForm((prev) => ({ ...prev, phone: e.target.value }));
                    if (editErrors.phone) setEditErrors((prev) => ({ ...prev, phone: undefined }));
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg border focus:ring-2 focus:ring-purple-500 focus:border-transparent ${
                    editErrors.phone 
                      ? "border-red-500" 
                      : darkMode ? "border-gray-600" : "border-gray-300"
                  } ${
                    darkMode 
                      ? "bg-gray-700 text-gray-100 placeholder-gray-400" 
                      : "bg-white text-gray-900 placeholder-gray-500"
                  }`}
                  placeholder="Enter phone number"
                />
                {editErrors.phone && (
                  <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                    <AlertCircle className="h-3.5 w-3.5" />
                    {editErrors.phone}
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className={`px-5 py-4 border-t flex gap-3 ${
              darkMode ? "border-gray-700" : "border-gray-200"
            }`}>
              <button
                onClick={closeEditModal}
                disabled={editSaving}
                className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                  darkMode 
                    ? "bg-gray-700 hover:bg-gray-600 text-gray-200" 
                    : "bg-gray-200 hover:bg-gray-300 text-gray-700"
                } disabled:opacity-50`}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving || !editForm.name.trim()}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {editSaving ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <DeleteConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete Supplier"
        message="Are you sure you want to delete this supplier?"
        itemName={deleteTarget?.name}
        warningText="This will permanently remove the supplier. Any supply stocks associated with this supplier will be affected."
        confirmButtonText="Delete Supplier"
        loading={deleting}
        darkMode={darkMode}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </>
  );
}

export default SupplierPanel;
