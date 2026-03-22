/**
 * submitMenuItem
 *
 * Orchestrates the create/edit flow including image upload:
 *
 *   CREATE
 *     1. POST /menu with text fields (no image yet)
 *     2. If the user chose a file → POST /menu/:id/image
 *
 *   EDIT
 *     1. PATCH /menu/:id with changed text fields
 *     2. If the user chose a new file → POST /menu/:id/image
 *
 * Keeps the form and image state in sync and surfaces errors to the UI.
 */
export async function submitMenuItem({
  editingId,
  form,
  imageFile,            // File | null — set by the file picker in AdminItems
  createMenuItem,
  updateMenuItem,
  uploadMenuItemImage,
  fetchMenu,
  setItems,
  resetForm,
  resetImage,
  setEditingId,
  setFormError,
  setSaving,
}) {
  // Build the JSON payload — note basePrice (not price) to match the backend schema
  const payload = {
    ...form,
    basePrice: Number(form.basePrice),
  };

  setSaving(true);

  try {
    let savedId = editingId;

    if (editingId) {
      // ── EDIT ──────────────────────────────────────────────────────────────
      await updateMenuItem(editingId, payload);
    } else {
      // ── CREATE ────────────────────────────────────────────────────────────
      const res = await createMenuItem(payload);
      // The backend returns { item: { id, ... } }
      savedId = res?.item?.id ?? res?.id ?? res?.itemId;
    }

    // ── Image upload (create or replace) ──────────────────────────────────
    if (imageFile && savedId != null) {
      await uploadMenuItemImage(savedId, imageFile);
    }

    // ── Refresh list ───────────────────────────────────────────────────────
    const data = await fetchMenu();
    setItems(data.items);

    // ── Reset UI ───────────────────────────────────────────────────────────
    resetForm();
    resetImage();
    setEditingId(null);
    setFormError("");
  } catch (err) {
    setFormError(err?.response?.data?.error || err?.message || "Submit failed");
  } finally {
    setSaving(false);
  }
}