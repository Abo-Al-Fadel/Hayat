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

// Validation helpers. Tolerate undefined: a supplier object arriving without a field
// should show a validation message, never throw inside a render.
const isValidEmail = (email?: string): boolean => {
  if (!email?.trim()) return true; // Empty is valid (optional field)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

const isValidPhone = (phone?: string): boolean => {
  if (!phone?.trim()) return true; // Empty is valid (optional field)
  // Phone can contain digits, spaces, hyphens, plus sign, and parentheses
  const phoneRegex = /^[\d\s\-+()]+$/;
  return phoneRegex.test(phone) && phone.replace(/[\s\-+()]/g, "").length >= 7;
};

interface SupplierFieldErrors {
  name?: string;
  email?: string;
  phone?: string;
}

/**
 * Shared by the add and edit forms so both reject the same things and word it the
 * same way. The add form previously only greyed out its button when the name was
 * blank, which said nothing about a malformed email or phone number - the request
 * went to the server and the 400 came back invisibly.
 */
function validateSupplierFields(fields: {
  name?: string;
  email?: string;
  phone?: string;
}): SupplierFieldErrors {
  const errors: SupplierFieldErrors = {};

  if (!fields.name?.trim()) {
    errors.name = "Supplier name is required.";
  } else if (fields.name.trim().length < 2) {
    errors.name = "Supplier name must be at least 2 characters.";
  }

  if (!isValidEmail(fields.email)) {
    errors.email = "Enter a valid email address, e.g. name@supplier.com.";
  }

  if (!isValidPhone(fields.phone)) {
    errors.phone = "Enter a valid phone number - at least 7 digits.";
  }

  return errors;
}

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
  const [addErrors, setAddErrors] = useState<SupplierFieldErrors>({});

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
      // Optional chaining throughout: searching must not be able to throw on a
      // supplier that arrived without a name.
      const nameMatch = supplier.name?.toLowerCase().includes(term);
      const emailMatch = supplier.email?.toLowerCase().includes(term);
      const phoneMatch = supplier.phone?.toLowerCase().includes(term);
      const contactMatch = supplier.contactInfo?.toLowerCase().includes(term);
      return nameMatch || emailMatch || phoneMatch || contactMatch;
    });
  }, [suppliers, searchTerm]);

  // Handle add supplier
  const handleAdd = useCallback(async () => {
    const errors = validateSupplierFields(newSupplier);
    setAddErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSaving(true);
    try {
      await onAddSupplier({
        ...newSupplier,
        name: newSupplier.name.trim(),
        // `|| undefined` so a blank optional field is omitted rather than sent as "",
        // matching the edit form. The server tolerates either now, but an empty string
        // is not what "no email" means.
        email: newSupplier.email?.trim() || undefined,
        phone: newSupplier.phone?.trim() || undefined,
      });

      // Reset form
      setShowAddForm(false);
      setAddErrors({});
      setNewSupplier({
        name: "",
        email: "",
        phone: "",
        address: "",
        contactInfo: "",
      });
    } catch (err) {
      // A server-side rejection must not vanish. The add form used to swallow it,
      // leaving the dialog open with no indication anything had gone wrong.
      const message =
        (err as { response?: { data?: { title?: string; message?: string } } })?.response?.data
          ?.message ??
        (err as { response?: { data?: { title?: string } } })?.response?.data?.title ??
        "Could not add the supplier. Please try again.";
      setAddErrors({ name: message });
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
      // `?? ""` rather than the raw value: a supplier missing a name used to put
      // undefined into the form, and the next .trim() took the whole page down.
      name: supplier.name ?? "",
      email: supplier.email ?? "",
      phone: supplier.phone ?? "",
    });
    setEditErrors({});
  }, []);

  // Close edit modal
  const closeEditModal = useCallback(() => {
    setEditTarget(null);
    setEditForm({ name: "", email: "", phone: "" });
    setEditErrors({});
  }, []);

  // Validate edit form - same rules and wording as the add form.
  const validateEditForm = useCallback((): boolean => {
    const errors = validateSupplierFields(editForm);
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
            {(() => {
              // Shared field styling so a field in error is obvious, not just annotated.
              const fieldClass = (hasError: boolean) =>
                `px-3 py-2 rounded-lg border focus:ring-2 focus:outline-none ${
                  hasError
                    ? "border-red-500 focus:ring-red-500"
                    : "focus:ring-purple-500 " + (darkMode ? "border-gray-600" : "border-gray-300")
                } ${
                  darkMode
                    ? "bg-gray-800 text-gray-100 placeholder-gray-400"
                    : "bg-white placeholder-gray-500"
                }`;

              const clearError = (field: keyof SupplierFieldErrors) =>
                setAddErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));

              return (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="flex flex-col">
                    <input
                      type="text"
                      placeholder="Supplier Name *"
                      aria-label="Supplier name"
                      aria-invalid={Boolean(addErrors.name)}
                      value={newSupplier.name}
                      onChange={(e) => {
                        setNewSupplier((prev) => ({ ...prev, name: e.target.value }));
                        clearError("name");
                      }}
                      className={fieldClass(Boolean(addErrors.name))}
                    />
                    {addErrors.name && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {addErrors.name}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <input
                      type="email"
                      placeholder="Email"
                      aria-label="Supplier email"
                      aria-invalid={Boolean(addErrors.email)}
                      value={newSupplier.email}
                      onChange={(e) => {
                        setNewSupplier((prev) => ({ ...prev, email: e.target.value }));
                        clearError("email");
                      }}
                      className={fieldClass(Boolean(addErrors.email))}
                    />
                    {addErrors.email && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {addErrors.email}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <input
                      type="tel"
                      placeholder="Phone"
                      aria-label="Supplier phone"
                      aria-invalid={Boolean(addErrors.phone)}
                      value={newSupplier.phone}
                      onChange={(e) => {
                        setNewSupplier((prev) => ({ ...prev, phone: e.target.value }));
                        clearError("phone");
                      }}
                      className={fieldClass(Boolean(addErrors.phone))}
                    />
                    {addErrors.phone && (
                      <div className="mt-1 flex items-center gap-1 text-sm text-red-500">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                        {addErrors.phone}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col">
                    <input
                      type="text"
                      placeholder="Address"
                      aria-label="Supplier address"
                      value={newSupplier.address}
                      onChange={(e) => setNewSupplier((prev) => ({ ...prev, address: e.target.value }))}
                      className={fieldClass(false)}
                    />
                  </div>
                </div>
              );
            })()}
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleAdd}
                // Deliberately not disabled on an empty name: a dead button explains
                // nothing. Clicking runs validation and says what is wrong.
                disabled={saving}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition-colors"
              >
                {/* "Save Supplier", not "Add Supplier": the button that opens this
                    form already says Add, and two controls with the same name are
                    ambiguous to anyone navigating by label. */}
                {saving ? "Saving..." : "Save Supplier"}
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setAddErrors({});
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
                        // Names the row: an icon-only button otherwise reads as
                        // "button" to a screen reader, whichever supplier it belongs to.
                        aria-label={`Edit ${supplier.name || "supplier"}`}
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
                        aria-label={`Delete ${supplier.name || "supplier"}`}
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
                <label htmlFor="edit-supplier-name" className={`block text-sm font-medium mb-1.5 ${
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
                  id="edit-supplier-name"
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
                <label htmlFor="edit-supplier-email" className={`block text-sm font-medium mb-1.5 ${
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
                  id="edit-supplier-email"
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
                <label htmlFor="edit-supplier-phone" className={`block text-sm font-medium mb-1.5 ${
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
                  id="edit-supplier-phone"
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
                // As with the add form: let the click explain the problem rather
                // than presenting a button that does nothing for unstated reasons.
                disabled={editSaving}
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
