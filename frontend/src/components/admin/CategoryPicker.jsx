import { useEffect, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { styled } from "@mui/material/styles"
import { fetchCategories, createCategory } from "../../API/categoryApi"
import { invalidateCategoriesCache } from "../../API/menuApi"

// ── Styled ────────────────────────────────────────────────────────────────────

const StyledSelect = styled("select")(({ theme }) => ({
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
  cursor: "pointer",
  "&:focus": { borderColor: theme.brand.primary },
}))

const ModalOverlay = styled(Box)(() => ({
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.35)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1300,
}))

const ModalCard = styled(Box)(({ theme }) => ({
  background: "#fff",
  borderRadius: 16,
  padding: 28,
  width: "100%",
  maxWidth: 400,
  display: "flex",
  flexDirection: "column",
  gap: 14,
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
  fontFamily: theme.brand.fontBase,
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
  "&:focus": { borderColor: theme.brand.primary },
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
}))

const ErrorMsg = styled(Typography)(({ theme }) => ({
  fontSize: 13,
  color: theme.brand.error,
  padding: "6px 10px",
  background: "#fff5f5",
  borderRadius: 8,
  border: "1px solid #fecaca",
}))

// ── Component ─────────────────────────────────────────────────────────────────

const ADD_NEW_SENTINEL = "__ADD_NEW__"

/**
 * CategoryPicker
 *
 * Renders a <select> of active Category documents. The last option is
 * "+ Add new category" which opens a lightweight inline modal (name + image URL).
 * Full category management lives at /admin/categories.
 *
 * Props:
 *   value      — current categoryId (ObjectId string) or null
 *   onChange   — (categoryId: string | null) => void
 */
export default function CategoryPicker({ value, onChange }) {
  const [categories, setCategories] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [modalName, setModalName] = useState("")
  const [modalImage, setModalImage] = useState("")
  const [modalError, setModalError] = useState("")
  const [saving, setSaving] = useState(false)
  const selectRef = useRef(null)

  useEffect(() => {
    fetchCategories().then(setCategories).catch(() => setCategories([]))
  }, [])

  function handleSelectChange(e) {
    const val = e.target.value
    if (val === ADD_NEW_SENTINEL) {
      // Reset select back to current value while modal is open
      if (selectRef.current) selectRef.current.value = value || ""
      setModalName("")
      setModalImage("")
      setModalError("")
      setShowModal(true)
    } else {
      onChange(val || null)
    }
  }

  async function handleModalSubmit() {
    if (!modalName.trim()) {
      setModalError("Name is required.")
      return
    }
    setSaving(true)
    setModalError("")
    try {
      const created = await createCategory({
        name: modalName.trim(),
        image: modalImage.trim(),
      })
      // Refresh category list and select the newly created one
      const refreshed = await fetchCategories()
      setCategories(refreshed)
      invalidateCategoriesCache()
      onChange(created._id)
      setShowModal(false)
    } catch (err) {
      setModalError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <StyledSelect
        ref={selectRef}
        value={value || ""}
        onChange={handleSelectChange}
      >
        <option value="">— Select category —</option>
        {categories.map((cat) => (
          <option key={cat._id} value={cat._id}>
            {cat.name}
          </option>
        ))}
        <option value={ADD_NEW_SENTINEL}>+ Add new category…</option>
      </StyledSelect>

      {showModal && (
        <ModalOverlay onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false) }}>
          <ModalCard>
            <Typography sx={{ fontWeight: 700, fontSize: 16 }}>
              Add New Category
            </Typography>
            <Typography sx={{ fontSize: 13, color: "text.secondary" }}>
              Name and optional image. Full management (subcategories, variant groups,
              ordering) is on the <strong>Categories</strong> admin page.
            </Typography>

            {modalError && <ErrorMsg component="p">{modalError}</ErrorMsg>}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Name *</label>
              <FieldInput
                autoFocus
                placeholder="e.g. Cold Drinks"
                value={modalName}
                onChange={(e) => setModalName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleModalSubmit() }}
              />
            </Box>

            <Box sx={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>Image URL (optional)</label>
              <FieldInput
                placeholder="https://… or /images/…"
                value={modalImage}
                onChange={(e) => setModalImage(e.target.value)}
              />
            </Box>

            <Box sx={{ display: "flex", gap: 10, justifyContent: "flex-end", mt: 1 }}>
              <GhostBtn type="button" onClick={() => setShowModal(false)}>
                Cancel
              </GhostBtn>
              <PrimaryBtn type="button" onClick={handleModalSubmit} disabled={saving}>
                {saving ? "Creating…" : "Create"}
              </PrimaryBtn>
            </Box>
          </ModalCard>
        </ModalOverlay>
      )}
    </>
  )
}
