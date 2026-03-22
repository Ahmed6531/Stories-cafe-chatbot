import { useEffect, useRef, useState } from "react"
import {
  fetchMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
} from "../../API/menuApi"
import { submitMenuItem } from "../../components/admin/submitMenuItem"
import { styled } from "@mui/material/styles"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"

// ── Styled components ──────────────────────────────────────────────────────────

const PageWrap = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
  gap: 28,
}))

const FormCard = styled(Box)(({ theme }) => ({
  maxWidth: 560,
  display: "flex",
  flexDirection: "column",
  gap: 12,
  padding: "24px",
  borderRadius: 16,
  border: `1px solid ${theme.brand.borderCard}`,
  background: theme.brand.bgLight,
}))

const FieldInput = styled("input")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  background: "#fff",
  border: `1px solid ${theme.brand.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  transition: "border-color 0.2s",
  "&:focus": { borderColor: theme.brand.primary },
  "&::placeholder": { color: theme.brand.radioInactive },
}))

const FieldTextarea = styled("textarea")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  background: "#fff",
  border: `1px solid ${theme.brand.border}`,
  borderRadius: 10,
  padding: "10px 12px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  resize: "vertical",
  transition: "border-color 0.2s",
  "&:focus": { borderColor: theme.brand.primary },
  "&::placeholder": { color: theme.brand.radioInactive },
}))

const CheckRow = styled("label")(({ theme }) => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  cursor: "pointer",
  userSelect: "none",
}))

const BtnRow = styled(Box)(() => ({
  display: "flex",
  gap: 10,
  marginTop: 4,
}))

const PrimaryBtn = styled("button")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 700,
  fontSize: 14,
  padding: "10px 20px",
  borderRadius: 10,
  border: "none",
  background: theme.brand.primary,
  color: "#fff",
  cursor: "pointer",
  transition: "background 0.2s",
  "&:hover:not(:disabled)": { background: theme.brand.primaryHover },
  "&:disabled": { opacity: 0.6, cursor: "not-allowed" },
}))

const GhostBtn = styled("button")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  fontSize: 14,
  padding: "10px 16px",
  borderRadius: 10,
  border: `1.5px solid ${theme.brand.border}`,
  background: "#fff",
  color: theme.brand.textPrimary,
  cursor: "pointer",
  transition: "border-color 0.2s, color 0.2s",
  "&:hover": { borderColor: theme.brand.primary, color: theme.brand.primary },
}))

const DangerBtn = styled("button")(() => ({
  fontFamily: "inherit",
  fontWeight: 600,
  fontSize: 13,
  padding: "6px 12px",
  borderRadius: 8,
  border: "1.5px solid #fca5a5",
  background: "#fff",
  color: "#dc2626",
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s",
  "&:hover": { background: "#fef2f2", borderColor: "#dc2626" },
}))

const EditBtn = styled("button")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  fontSize: 13,
  padding: "6px 12px",
  borderRadius: 8,
  border: `1.5px solid ${theme.brand.border}`,
  background: "#fff",
  color: theme.brand.primary,
  cursor: "pointer",
  transition: "background 0.2s, border-color 0.2s",
  "&:hover": {
    background: "rgba(0,112,74,0.06)",
    borderColor: theme.brand.primary,
  },
}))

const StyledTable = styled("table")(({ theme }) => ({
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
}))

const Th = styled("th")(({ theme }) => ({
  textAlign: "left",
  padding: "10px 14px",
  fontWeight: 700,
  fontSize: 13,
  color: theme.brand.textSecondary,
  borderBottom: `2px solid ${theme.brand.borderCard}`,
  whiteSpace: "nowrap",
}))

const Td = styled("td")(({ theme }) => ({
  padding: "10px 14px",
  borderBottom: `1px solid ${theme.brand.borderLight}`,
  color: theme.brand.textPrimary,
  verticalAlign: "middle",
}))

const ErrorMsg = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 13,
  fontWeight: 500,
  color: theme.brand.error,
  padding: "8px 12px",
  background: "#fff5f5",
  borderRadius: 8,
  border: "1px solid #fecaca",
}))

const UploadZone = styled("label")(({ theme, $hasFile }) => ({
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "10px 12px",
  borderRadius: 10,
  border: `1.5px dashed ${$hasFile ? theme.brand.primary : theme.brand.border}`,
  background: $hasFile ? "rgba(0,112,74,0.04)" : "#fff",
  cursor: "pointer",
  transition: "border-color 0.2s, background 0.2s",
  "&:hover": {
    borderColor: theme.brand.primary,
    background: "rgba(0,112,74,0.04)",
  },
}))

const UploadLabel = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 13,
  fontWeight: 500,
  color: theme.brand.textSecondary,
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
}))

const ImagePreview = styled("img")(() => ({
  width: 48,
  height: 48,
  objectFit: "cover",
  borderRadius: 8,
  flexShrink: 0,
  border: "1px solid #e5e7eb",
}))

const Badge = styled("span")(({ $yes }) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  background: $yes ? "#dcfce7" : "#f3f4f6",
  color: $yes ? "#166534" : "#6b7280",
}))

// ── Form state ─────────────────────────────────────────────────────────────────

// slug intentionally excluded — auto-generated by the backend from name
const EMPTY_FORM = {
  name: "",
  category: "",
  basePrice: "",
  description: "",
  isAvailable: true,
  isFeatured: false,
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState("")

  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState("")
  const fileInputRef = useRef(null)

  useEffect(() => { load() }, [])

  useEffect(() => {
    return () => {
      if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    }
  }, [imagePreview])

  async function load() {
    try {
      setLoading(true)
      const data = await fetchMenu()
      setItems(data.items)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function onFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }))
  }

  function onFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function resetImage() {
    if (imagePreview?.startsWith("blob:")) URL.revokeObjectURL(imagePreview)
    setImageFile(null)
    setImagePreview("")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  function validateForm() {
    if (!form.name.trim()) return "Name is required"
    if (!form.category.trim()) return "Category is required"
    if (!editingId && !imageFile && !imagePreview) return "Please select an image"
    const priceNum = Number(form.basePrice)
    if (Number.isNaN(priceNum) || priceNum < 0) return "Base price must be a number ≥ 0"
    return ""
  }

  async function onSubmit(e) {
    e.preventDefault()
    const msg = validateForm()
    if (msg) { setFormError(msg); return }
    setFormError("")

    await submitMenuItem({
      editingId,
      form,
      imageFile,
      createMenuItem,
      updateMenuItem,
      uploadMenuItemImage,
      fetchMenu,
      setItems,
      resetForm: () => setForm(EMPTY_FORM),
      resetImage,
      setEditingId,
      setFormError,
      setSaving,
    })
  }

  async function handleDelete(id) {
    if (!confirm("Delete this item?")) return
    try {
      await deleteMenuItem(id)
      const data = await fetchMenu()
      setItems(data.items)
    } catch (err) {
      setFormError(err.message)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({
      name: item.name || "",
      category: item.category || "",
      basePrice: item.basePrice ?? "",
      description: item.description || "",
      isAvailable: item.isAvailable ?? true,
      isFeatured: item.isFeatured ?? false,
      // slug intentionally omitted — backend regenerates if name changes
    })
    resetImage()
    setImagePreview(item.image || "")
    setFormError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    resetImage()
    setFormError("")
  }

  if (loading) return <Typography sx={{ p: 2 }}>Loading menu items…</Typography>
  if (error) return <ErrorMsg>{error}</ErrorMsg>

  const imagePickerLabel = imageFile
    ? imageFile.name
    : imagePreview
    ? "Click to replace image"
    : "Click to choose image…"

  return (
    <PageWrap>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Manage Menu Items
      </Typography>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <FormCard component="form" onSubmit={onSubmit}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {editingId ? "Edit Item" : "Create New Item"}
        </Typography>

        {formError && <ErrorMsg component="p">{formError}</ErrorMsg>}

        <FieldInput
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={onFormChange}
        />
        <FieldInput
          name="category"
          placeholder="Category"
          value={form.category}
          onChange={onFormChange}
        />

        {/* ── Image upload ─────────────────────────────────────────────────── */}
        <UploadZone $hasFile={!!imageFile || !!imagePreview}>
          {imagePreview && <ImagePreview src={imagePreview} alt="preview" />}
          <UploadLabel>{imagePickerLabel}</UploadLabel>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            style={{ display: "none" }}
            onChange={onFileChange}
          />
        </UploadZone>

        <FieldInput
          name="basePrice"
          placeholder="Base Price"
          value={form.basePrice}
          onChange={onFormChange}
          type="number"
          step="0.01"
          min="0"
        />
        <FieldTextarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={onFormChange}
          rows={3}
        />

        <CheckRow>
          <input
            type="checkbox"
            name="isAvailable"
            checked={form.isAvailable}
            onChange={onFormChange}
          />
          Available
        </CheckRow>

        <CheckRow>
          <input
            type="checkbox"
            name="isFeatured"
            checked={form.isFeatured}
            onChange={onFormChange}
          />
          Featured on homepage
        </CheckRow>

        <BtnRow>
          <PrimaryBtn type="submit" disabled={saving}>
            {saving ? "Saving…" : editingId ? "Save Changes" : "Create"}
          </PrimaryBtn>
          {editingId && (
            <GhostBtn type="button" onClick={cancelEdit}>
              Cancel
            </GhostBtn>
          )}
        </BtnRow>
      </FormCard>

      {/* ── Table ────────────────────────────────────────────────────────────── */}
      <Box sx={{ overflowX: "auto" }}>
        <StyledTable>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Image</Th>
              <Th>Base Price</Th>
              <Th>Available</Th>
              <Th>Featured</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td>{item.name}</Td>
                <Td>{item.category}</Td>
                <Td>
                  {item.image && item.image !== "/images/placeholder.png" ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      width={48}
                      height={48}
                      style={{ borderRadius: 6, objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>No image</span>
                  )}
                </Td>
                <Td>L.L {item.basePrice?.toLocaleString()}</Td>
                <Td><Badge $yes={item.isAvailable}>{item.isAvailable ? "Yes" : "No"}</Badge></Td>
                <Td><Badge $yes={item.isFeatured}>{item.isFeatured ? "Yes" : "No"}</Badge></Td>
                <Td>
                  <Box sx={{ display: "flex", gap: 1 }}>
                    <EditBtn type="button" onClick={() => startEdit(item)}>Edit</EditBtn>
                    <DangerBtn type="button" onClick={() => handleDelete(item.id)}>Delete</DangerBtn>
                  </Box>
                </Td>
              </tr>
            ))}
          </tbody>
        </StyledTable>
      </Box>
    </PageWrap>
  )
}