export async function submitMenuItem({
  editingId,
  form,
  imageFile,
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
  const payload = {
    ...form,
    price: Number(form.price),
  }

  setSaving(true)

  try {
    let savedId = editingId

    // EDIT flow
    if (editingId) {
      await updateMenuItem(editingId, payload)
    }
    // CREATE flow
    else {
      const res = await createMenuItem(payload)
      savedId = res?.id ?? res?.item?.id ?? res?.itemId
    }

    // Upload image if present
    if (imageFile && savedId != null) {
      await uploadMenuItemImage(savedId, imageFile)
    }

    // Refresh menu items
    const data = await fetchMenu()
    setItems(data.items)

    // Reset UI state
    resetForm()
    resetImage()
    setEditingId(null)
    setFormError("")
  } catch (err) {
    setFormError(err?.message || "Submit failed")
  } finally {
    setSaving(false)
  }
}