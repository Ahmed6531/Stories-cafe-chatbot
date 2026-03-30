/**
 * submitMenuItem
 *
 * Orchestrates the create/edit flow including image upload:
 *
 *   CREATE
 *     1. POST /menu with text fields (no image yet)
 *     2. If the user chose a file â†’ POST /menu/:id/image
 *
 *   EDIT
 *     1. PATCH /menu/:id with changed text fields
 *     2. If the user chose a new file â†’ POST /menu/:id/image
 *
 * Keeps the form and image state in sync and surfaces errors to the UI.
 */
export async function submitMenuItem({
  editingId,
  form,
  variantGroups,        // string[] â€” ordered groupId array from AdminItems
  imageFile,            // File | null â€” set by the file picker in AdminItems
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
  // Build the JSON payload â€” note basePrice (not price) to match the backend schema
  const payload = {
    ...form,
    basePrice: Number(form.basePrice),
    variantGroups,
  };

  setSaving(true);

  try {
    let savedId = editingId;

    if (editingId) {
      // â”€â”€ EDIT â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      await updateMenuItem(editingId, payload);
    } else {
      // â”€â”€ CREATE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
      // createMenuItem returns the transformed item (flat object) â€” res.id is the numeric ID
      const res = await createMenuItem(payload);
      savedId = res?.id;
    }

    // â”€â”€ Image upload (create or replace) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    let imageError = null;
    if (imageFile && savedId != null) {
      try {
        await uploadMenuItemImage(savedId, imageFile);
      } catch (err) {
        // Surface the image error but don't abort â€” the item was already saved.
        // The list still refreshes so the imageless item appears rather than vanishing.
        imageError = err?.message || "Image upload failed";
      }
    }

    // â”€â”€ Refresh list â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const data = await fetchMenu();
    setItems(data.items);

    // â”€â”€ Reset UI â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
