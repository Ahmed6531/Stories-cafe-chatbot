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
<<<<<<< HEAD
=======
  variantGroups,        // string[] — ordered groupId array from AdminItems
>>>>>>> dev
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
<<<<<<< HEAD
=======
    variantGroups,
>>>>>>> dev
  };

  setSaving(true);

  try {
    let savedId = editingId;

    if (editingId) {
      // ── EDIT ──────────────────────────────────────────────────────────────
      await updateMenuItem(editingId, payload);
    } else {
      // ── CREATE ────────────────────────────────────────────────────────────
      // createMenuItem returns the transformed item (flat object) — res.id is the numeric ID
      const res = await createMenuItem(payload);
      savedId = res?.id;
    }

    // ── Image upload (create or replace) ──────────────────────────────────
    let imageError = null;
    if (imageFile && savedId != null) {
      try {
        await uploadMenuItemImage(savedId, imageFile);
      } catch (err) {
        // Surface the image error but don't abort — the item was already saved.
        // The list still refreshes so the imageless item appears rather than vanishing.
        imageError = err?.message || "Image upload failed";
      }
    }

    // ── Refresh list ───────────────────────────────────────────────────────
    const data = await fetchMenu();
    setItems(data.items);

    // ── Reset UI ───────────────────────────────────────────────────────────
    resetForm();
    resetImage();
    setEditingId(null);
    setFormError(imageError || "");
  } catch (err) {
    setFormError(err?.response?.data?.error || err?.message || "Submit failed");
  } finally {
    setSaving(false);
  }
}