import { useEffect, useState } from "react"
import {
  fetchVariantGroups,
  createVariantGroup,
  updateVariantGroup,
  deleteVariantGroup,
} from "../../API/variantGroupApi"
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
  gap: 16,
  padding: "24px",
  borderRadius: 16,
  border: `1px solid ${theme.brand.borderCard}`,
  background: theme.brand.bgLight,
}))

const FieldGroup = styled(Box)(() => ({
  display: "flex",
  flexDirection: "column",
  gap: 6,
}))

const FieldLabel = styled("label")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 13,
  fontWeight: 600,
  color: theme.brand.textPrimary,
}))

const FieldHint = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 12,
  color: theme.brand.textSecondary,
}))

const SlugPreview = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 11,
  color: theme.brand.textSecondary,
  fontStyle: "italic",
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
  "&:hover": { background: "rgba(0,112,74,0.06)", borderColor: theme.brand.primary },
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

const GroupCard = styled(Box)(({ theme }) => ({
  padding: "16px 20px",
  borderRadius: 12,
  border: `1px solid ${theme.brand.borderCard}`,
  background: "#fff",
  display: "flex",
  flexDirection: "column",
  gap: 10,
}))

const GroupCardHeader = styled(Box)(() => ({
  display: "flex",
  alignItems: "flex-start",
  justifyContent: "space-between",
  gap: 12,
}))

const GroupCardActions = styled(Box)(() => ({
  display: "flex",
  gap: 6,
  flexShrink: 0,
}))

const Badge = styled("span")(({ $required }) => ({
  display: "inline-block",
  padding: "2px 8px",
  borderRadius: 6,
  fontSize: 12,
  fontWeight: 600,
  background: $required ? "#fef3c7" : "#f3f4f6",
  color: $required ? "#92400e" : "#6b7280",
}))

const Pill = styled("span")(({ theme }) => ({
  display: "inline-block",
  padding: "2px 10px",
  borderRadius: 20,
  fontSize: 12,
  fontWeight: 500,
  background: "rgba(0,112,74,0.08)",
  color: theme.brand.primary,
  border: `1px solid rgba(0,112,74,0.18)`,
}))

// ── Helpers ────────────────────────────────────────────────────────────────────

function toSlugPreview(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
}

const EMPTY_FORM = {
  adminName: "",
  customerLabel: "",
  optionsRaw: "",
  isRequired: false,
  maxSelections: "",
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function AdminVariantGroups() {
  const [groups, setGroups] = useState([])
  const [loading, setLoading] = useState(true)
  const [pageError, setPageError] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingGroupId, setEditingGroupId] = useState(null)
  const [formError, setFormError] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  async function load() {
    try {
      setLoading(true)
      setPageError(null)
      const data = await fetchVariantGroups()
      setGroups(data)
    } catch (err) {
      setPageError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function onFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }))
  }

  function resetForm() {
    setForm(EMPTY_FORM)
    setEditingGroupId(null)
    setFormError("")
  }

  function startEdit(group) {
    setEditingGroupId(group.groupId)
    setForm({
      adminName: group.adminName || group.name || "",
      customerLabel: group.customerLabel || "",
      optionsRaw: (group.options || []).map((o) => o.name).join(", "),
      isRequired: group.isRequired || false,
      maxSelections: group.maxSelections != null ? String(group.maxSelections) : "",
    })
    setFormError("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function onSubmit(e) {
    e.preventDefault()
    if (!form.adminName.trim()) { setFormError("Group name is required."); return }
    setFormError("")
    setSaving(true)

    const options = form.optionsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((name, i) => ({ name, additionalPrice: 0, isActive: true, order: i + 1 }))

    const payload = {
      adminName: form.adminName.trim(),
      customerLabel: form.customerLabel.trim(),
      isRequired: form.isRequired,
      maxSelections: form.maxSelections !== "" ? Number(form.maxSelections) : null,
      options,
    }

    try {
      if (editingGroupId) {
        await updateVariantGroup(editingGroupId, payload)
      } else {
        await createVariantGroup(payload)
      }
      await load()
      resetForm()
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(groupId) {
    if (!confirm("Delete this variant group? Items referencing it will still have the ID stored — clean those up manually.")) return
    try {
      await deleteVariantGroup(groupId)
      await load()
    } catch (err) {
      setPageError(err.message)
    }
  }

  if (loading) return <Typography sx={{ p: 2 }}>Loading variant groups…</Typography>
  if (pageError) return <ErrorMsg component="p">{pageError}</ErrorMsg>

  const slugPreview = form.adminName ? toSlugPreview(form.adminName) : ""

  return (
    <PageWrap>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Variant Groups
      </Typography>

      {/* ── Form ─────────────────────────────────────────────────────────────── */}
      <FormCard component="form" onSubmit={onSubmit}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {editingGroupId ? "Edit Group" : "Create New Group"}
        </Typography>

        {formError && <ErrorMsg component="p">{formError}</ErrorMsg>}

        <FieldGroup>
          <FieldLabel htmlFor="adminName">Group name</FieldLabel>
          <FieldHint>Only visible in the admin dashboard</FieldHint>
          <FieldInput
            id="adminName"
            name="adminName"
            placeholder="e.g. Coffee size (S/M), Milk type"
            value={form.adminName}
            onChange={onFormChange}
          />
          {slugPreview && <SlugPreview>ID will be: {slugPreview}</SlugPreview>}
        </FieldGroup>

        <FieldGroup>
          <FieldLabel htmlFor="customerLabel">Customer label</FieldLabel>
          <FieldHint>What customers see when ordering — defaults to group name if left blank</FieldHint>
          <FieldInput
            id="customerLabel"
            name="customerLabel"
            placeholder="e.g. Choose your size"
            value={form.customerLabel}
            onChange={onFormChange}
          />
        </FieldGroup>

        <FieldGroup>
          <FieldLabel htmlFor="optionsRaw">Options</FieldLabel>
          <FieldHint>Comma-separated</FieldHint>
          <FieldInput
            id="optionsRaw"
            name="optionsRaw"
            placeholder="Small, Medium, Large"
            value={form.optionsRaw}
            onChange={onFormChange}
          />
        </FieldGroup>

        <FieldGroup>
          <FieldLabel htmlFor="maxSelections">Max selections</FieldLabel>
          <FieldHint>Leave blank for unlimited</FieldHint>
          <FieldInput
            id="maxSelections"
            name="maxSelections"
            placeholder="e.g. 1"
            value={form.maxSelections}
            onChange={onFormChange}
            type="number"
            min="1"
            style={{ maxWidth: 120 }}
          />
        </FieldGroup>

        <CheckRow>
          <input
            type="checkbox"
            name="isRequired"
            checked={form.isRequired}
            onChange={onFormChange}
          />
          Required — customer must choose
        </CheckRow>

        <BtnRow>
          <PrimaryBtn type="submit" disabled={saving}>
            {saving ? "Saving…" : editingGroupId ? "Save Changes" : "Create"}
          </PrimaryBtn>
          {editingGroupId && (
            <GhostBtn type="button" onClick={resetForm}>Cancel</GhostBtn>
          )}
        </BtnRow>
      </FormCard>

      {/* ── Group list ────────────────────────────────────────────────────────── */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {groups.length === 0 && (
          <Typography sx={{ fontSize: 14, color: "text.secondary" }}>
            No variant groups yet.
          </Typography>
        )}
        {groups.map((group) => {
          const displayName = group.adminName || group.name
          const customerLabel = group.customerLabel || group.name
          const labelDiffers = customerLabel && customerLabel !== displayName

          return (
            <GroupCard key={group.groupId}>
              <GroupCardHeader>
                <Box sx={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Typography sx={{ fontWeight: 700, fontSize: 15 }}>
                      {displayName}
                    </Typography>
                    <Badge $required={group.isRequired}>
                      {group.isRequired ? "Required" : "Optional"}
                    </Badge>
                  </Box>
                  <Typography sx={{ fontSize: 11, color: "#9ca3af", fontFamily: "monospace" }}>
                    {group.groupId}
                  </Typography>
                  {labelDiffers && (
                    <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                      Shows as: <strong>{customerLabel}</strong>
                    </Typography>
                  )}
                </Box>
                <GroupCardActions>
                  <EditBtn type="button" onClick={() => startEdit(group)}>Edit</EditBtn>
                  <DangerBtn type="button" onClick={() => handleDelete(group.groupId)}>Delete</DangerBtn>
                </GroupCardActions>
              </GroupCardHeader>

              {group.options?.length > 0 && (
                <Box sx={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {group.options.map((opt) => (
                    <Pill key={opt.name}>{opt.name}</Pill>
                  ))}
                </Box>
              )}
            </GroupCard>
          )
        })}
      </Box>
    </PageWrap>
  )
}