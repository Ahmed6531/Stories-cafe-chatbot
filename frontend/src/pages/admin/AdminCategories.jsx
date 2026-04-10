import { useEffect, useState } from "react"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import { styled } from "@mui/material/styles"
import {
  fetchCategories,
  createCategory,
  updateCategory,
} from "../../API/categoryApi"
import {
  fetchVariantGroupsByCategory,
  createVariantGroupForCategory,
  updateVariantGroupForCategory,
  deleteVariantGroupForCategory,
} from "../../API/variantGroupApi"
import { invalidateCategoriesCache } from "../../API/menuApi"

const PageWrap = styled(Box)(() => ({ display: "flex", flexDirection: "column", gap: 24 }))

const Card = styled(Box)(({ theme }) => ({
  padding: "16px 20px",
  borderRadius: 14,
  border: `1px solid ${theme.brand.borderCard}`,
  background: theme.brand.bgLight,
  display: "flex",
  flexDirection: "column",
  gap: 12,
}))

const FieldInput = styled("input")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 13,
  color: theme.brand.textPrimary,
  background: "#fff",
  border: `1px solid ${theme.brand.border}`,
  borderRadius: 8,
  padding: "8px 10px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
  "&:focus": { borderColor: theme.brand.primary },
}))

const PrimaryBtn = styled("button")(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 700,
  fontSize: 13,
  padding: "8px 16px",
  borderRadius: 8,
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
  fontSize: 13,
  padding: "8px 14px",
  borderRadius: 8,
  border: `1.5px solid ${theme.brand.border}`,
  background: "#fff",
  color: theme.brand.textPrimary,
  cursor: "pointer",
}))

const DangerBtn = styled("button")(() => ({
  fontFamily: "inherit",
  fontWeight: 600,
  fontSize: 12,
  padding: "5px 10px",
  borderRadius: 7,
  border: "1.5px solid #fca5a5",
  background: "#fff",
  color: "#dc2626",
  cursor: "pointer",
  "&:hover": { background: "#fef2f2" },
}))

const Toggle = styled("button")(({ $active }) => ({
  fontFamily: "inherit",
  fontWeight: 600,
  fontSize: 12,
  padding: "4px 10px",
  borderRadius: 20,
  border: "none",
  background: $active ? "#dcfce7" : "#f3f4f6",
  color: $active ? "#166534" : "#6b7280",
  cursor: "pointer",
}))

const ErrorMsg = styled(Typography)(({ theme }) => ({
  fontSize: 12,
  color: theme.brand.error,
  padding: "5px 10px",
  background: "#fff5f5",
  borderRadius: 6,
  border: "1px solid #fecaca",
}))

const SectionLabel = styled(Typography)(() => ({
  fontSize: 11,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: 0.5,
  color: "#6b7280",
  marginTop: 4,
}))

function createSuboptionDraft(suboption = {}) {
  return {
    name: suboption.name || "",
    additionalPrice: String(suboption.additionalPrice ?? 0),
  }
}

function createOptionDraft(option = {}) {
  return {
    name: option.name || "",
    additionalPrice: String(option.additionalPrice ?? 0),
    isActive: option.isActive !== false,
    suboptions: Array.isArray(option.suboptions)
      ? option.suboptions.map(createSuboptionDraft)
      : [],
  }
}

function parsePrice(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

function validateOptionDrafts(options) {
  for (let i = 0; i < options.length; i += 1) {
    const option = options[i]
    if (!option.name.trim()) return `Option ${i + 1} needs a name.`
    if (!Number.isFinite(Number(option.additionalPrice))) {
      return `Option ${i + 1} has an invalid additional price.`
    }

    for (let j = 0; j < option.suboptions.length; j += 1) {
      const suboption = option.suboptions[j]
      if (!suboption.name.trim()) {
        return `Suboption ${j + 1} in option ${i + 1} needs a name.`
      }
      if (!Number.isFinite(Number(suboption.additionalPrice))) {
        return `Suboption ${j + 1} in option ${i + 1} has an invalid additional price.`
      }
    }
  }

  return ""
}

function serializeOptionDrafts(options) {
  return options.map((option, index) => ({
    name: option.name.trim(),
    additionalPrice: parsePrice(option.additionalPrice),
    isActive: option.isActive !== false,
    order: index + 1,
    suboptions: option.suboptions.map((suboption) => ({
      name: suboption.name.trim(),
      additionalPrice: parsePrice(suboption.additionalPrice),
    })),
  }))
}

function VariantOptionsEditor({ options, setOptions, disabled = false }) {
  function updateOption(index, updater) {
    setOptions((prev) => prev.map((option, i) => (i === index ? updater(option) : option)))
  }

  function removeOption(index) {
    setOptions((prev) => prev.filter((_, i) => i !== index))
  }

  function addOption() {
    setOptions((prev) => [...prev, createOptionDraft()])
  }

  function addSuboption(optionIndex) {
    updateOption(optionIndex, (option) => ({
      ...option,
      suboptions: [...option.suboptions, createSuboptionDraft()],
    }))
  }

  function updateSuboption(optionIndex, suboptionIndex, updater) {
    updateOption(optionIndex, (option) => ({
      ...option,
      suboptions: option.suboptions.map((suboption, i) =>
        i === suboptionIndex ? updater(suboption) : suboption,
      ),
    }))
  }

  function removeSuboption(optionIndex, suboptionIndex) {
    updateOption(optionIndex, (option) => ({
      ...option,
      suboptions: option.suboptions.filter((_, i) => i !== suboptionIndex),
    }))
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <SectionLabel>Options</SectionLabel>
      {options.length === 0 && (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          No options yet. Add one below.
        </Typography>
      )}

      {options.map((option, optionIndex) => (
        <Box
          key={`option-${optionIndex}`}
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 10,
            p: "10px 12px",
            border: "1px solid #e5e7eb",
            borderRadius: 10,
            background: "#fff",
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 700, color: "#4b5563" }}>
              Option {optionIndex + 1}
            </Typography>
            <DangerBtn type="button" onClick={() => removeOption(optionIndex)} disabled={disabled}>
              Remove option
            </DangerBtn>
          </Box>

          <Box sx={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FieldInput
              placeholder="Option name *"
              value={option.name}
              onChange={(e) => updateOption(optionIndex, (current) => ({ ...current, name: e.target.value }))}
              style={{ flex: 1, minWidth: 180 }}
              disabled={disabled}
            />
            <FieldInput
              placeholder="Additional price"
              type="number"
              step="0.01"
              value={option.additionalPrice}
              onChange={(e) => updateOption(optionIndex, (current) => ({ ...current, additionalPrice: e.target.value }))}
              style={{ width: 150, flex: "none" }}
              disabled={disabled}
            />
            <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: disabled ? "default" : "pointer" }}>
              <input
                type="checkbox"
                checked={option.isActive}
                onChange={(e) => updateOption(optionIndex, (current) => ({ ...current, isActive: e.target.checked }))}
                disabled={disabled}
              />
              Active
            </label>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 8, pl: { xs: 0, sm: 1 } }}>
            <SectionLabel>Suboptions</SectionLabel>
            {option.suboptions.length === 0 && (
              <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
                No suboptions for this option yet.
              </Typography>
            )}
            {option.suboptions.map((suboption, suboptionIndex) => (
              <Box
                key={`option-${optionIndex}-suboption-${suboptionIndex}`}
                sx={{
                  display: "flex",
                  gap: 8,
                  flexWrap: "wrap",
                  alignItems: "center",
                  p: "8px 10px",
                  border: "1px dashed #d1d5db",
                  borderRadius: 8,
                  background: "#f9fafb",
                }}
              >
                <FieldInput
                  placeholder="Suboption name *"
                  value={suboption.name}
                  onChange={(e) =>
                    updateSuboption(optionIndex, suboptionIndex, (current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  style={{ flex: 1, minWidth: 160 }}
                  disabled={disabled}
                />
                <FieldInput
                  placeholder="Additional price"
                  type="number"
                  step="0.01"
                  value={suboption.additionalPrice}
                  onChange={(e) =>
                    updateSuboption(optionIndex, suboptionIndex, (current) => ({
                      ...current,
                      additionalPrice: e.target.value,
                    }))
                  }
                  style={{ width: 150, flex: "none" }}
                  disabled={disabled}
                />
                <DangerBtn
                  type="button"
                  onClick={() => removeSuboption(optionIndex, suboptionIndex)}
                  disabled={disabled}
                >
                  Remove
                </DangerBtn>
              </Box>
            ))}

            <GhostBtn type="button" onClick={() => addSuboption(optionIndex)} disabled={disabled} style={{ alignSelf: "flex-start" }}>
              + Add suboption
            </GhostBtn>
          </Box>
        </Box>
      ))}

      <GhostBtn type="button" onClick={addOption} disabled={disabled} style={{ alignSelf: "flex-start" }}>
        + Add option
      </GhostBtn>
    </Box>
  )
}

function VariantGroupForm({ categoryId, onSaved }) {
  const [adminName, setAdminName] = useState("")
  const [customerLabel, setCustomerLabel] = useState("")
  const [isRequired, setIsRequired] = useState(false)
  const [maxSelections, setMaxSelections] = useState("")
  const [options, setOptions] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit() {
    if (!adminName.trim()) {
      setError("Admin name is required.")
      return
    }

    const optionError = validateOptionDrafts(options)
    if (optionError) {
      setError(optionError)
      return
    }

    setSaving(true)
    setError("")
    try {
      await createVariantGroupForCategory(categoryId, {
        adminName: adminName.trim(),
        customerLabel: customerLabel.trim(),
        isRequired,
        maxSelections: maxSelections !== "" ? Number(maxSelections) : undefined,
        options: serializeOptionDrafts(options),
      })
      setAdminName("")
      setCustomerLabel("")
      setIsRequired(false)
      setMaxSelections("")
      setOptions([])
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 10, p: "10px 12px", border: "1px dashed #d1d5db", borderRadius: 8 }}>
      <Typography sx={{ fontSize: 12, fontWeight: 700, color: "text.secondary" }}>
        New Variant Group
      </Typography>
      {error && <ErrorMsg component="p">{error}</ErrorMsg>}
      <Box sx={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <FieldInput
          placeholder="Admin name *"
          value={adminName}
          onChange={(e) => setAdminName(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <FieldInput
          placeholder="Customer label"
          value={customerLabel}
          onChange={(e) => setCustomerLabel(e.target.value)}
          style={{ flex: 1, minWidth: 120 }}
        />
        <FieldInput
          placeholder="Max selections"
          type="number"
          min="1"
          value={maxSelections}
          onChange={(e) => setMaxSelections(e.target.value)}
          style={{ width: 120, flex: "none" }}
        />
      </Box>
      <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
        <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
        Required
      </label>
      <VariantOptionsEditor options={options} setOptions={setOptions} disabled={saving} />
      <PrimaryBtn type="button" onClick={handleSubmit} disabled={saving} style={{ alignSelf: "flex-start" }}>
        {saving ? "Adding..." : "Add Group"}
      </PrimaryBtn>
    </Box>
  )
}

function ExistingVariantGroupEditor({ categoryId, group, onSaved, onDeactivate }) {
  const [editing, setEditing] = useState(false)
  const [customerLabel, setCustomerLabel] = useState(group.customerLabel || "")
  const [isRequired, setIsRequired] = useState(group.isRequired === true)
  const [maxSelections, setMaxSelections] = useState(group.maxSelections ?? "")
  const [options, setOptions] = useState(
    Array.isArray(group.options) ? group.options.map(createOptionDraft) : [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    setEditing(false)
    setCustomerLabel(group.customerLabel || "")
    setIsRequired(group.isRequired === true)
    setMaxSelections(group.maxSelections ?? "")
    setOptions(Array.isArray(group.options) ? group.options.map(createOptionDraft) : [])
    setError("")
  }, [group])

  async function handleSave() {
    const optionError = validateOptionDrafts(options)
    if (optionError) {
      setError(optionError)
      return
    }

    setSaving(true)
    setError("")
    try {
      await updateVariantGroupForCategory(categoryId, group.groupId, {
        customerLabel: customerLabel.trim(),
        isRequired,
        maxSelections,
        options: serializeOptionDrafts(options),
      })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  function handleCancel() {
    setEditing(false)
    setCustomerLabel(group.customerLabel || "")
    setIsRequired(group.isRequired === true)
    setMaxSelections(group.maxSelections ?? "")
    setOptions(Array.isArray(group.options) ? group.options.map(createOptionDraft) : [])
    setError("")
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: "column",
        gap: 10,
        p: "10px 12px",
        border: "1px solid #e5e7eb",
        borderRadius: 8,
        background: "#fafafa",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 180 }}>
          <Typography sx={{ fontSize: 13, fontWeight: 600 }}>
            {group.adminName}{" "}
            {group.customerLabel && group.customerLabel !== group.adminName && (
              <span style={{ fontWeight: 400, color: "#6b7280" }}>
                {"->"} "{group.customerLabel}"
              </span>
            )}
          </Typography>
          <Typography sx={{ fontSize: 11, color: "#9ca3af" }}>
            {group.options?.length || 0} options · {group.isRequired ? "required" : "optional"} ·
            {" "}max {group.maxSelections ?? "∞"} · id: {group.groupId}
          </Typography>
        </Box>
        <GhostBtn type="button" onClick={() => (editing ? handleCancel() : setEditing(true))}>
          {editing ? "Cancel" : "Manage options"}
        </GhostBtn>
        <DangerBtn type="button" onClick={() => onDeactivate(group.groupId)}>
          Deactivate
        </DangerBtn>
      </Box>

      {editing && (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 10, pt: 2, borderTop: "1px solid #e5e7eb" }}>
          {error && <ErrorMsg component="p">{error}</ErrorMsg>}
          <Box sx={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <FieldInput
              value={group.adminName}
              disabled
              style={{ flex: 1, minWidth: 160, background: "#f3f4f6" }}
            />
            <FieldInput
              placeholder="Customer label"
              value={customerLabel}
              onChange={(e) => setCustomerLabel(e.target.value)}
              style={{ flex: 1, minWidth: 160 }}
            />
            <FieldInput
              placeholder="Max selections"
              type="number"
              min="1"
              value={maxSelections}
              onChange={(e) => setMaxSelections(e.target.value)}
              style={{ width: 140, flex: "none" }}
            />
          </Box>
          <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            Required
          </label>
          <VariantOptionsEditor options={options} setOptions={setOptions} disabled={saving} />
          <PrimaryBtn type="button" onClick={handleSave} disabled={saving} style={{ alignSelf: "flex-start" }}>
            {saving ? "Saving..." : "Save Group"}
          </PrimaryBtn>
        </Box>
      )}
    </Box>
  )
}

function CategoryDetail({ category, onRefresh }) {
  const [groups, setGroups] = useState([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editImage, setEditImage] = useState(category.image || "")
  const [editOrder, setEditOrder] = useState(category.order ?? 0)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  async function loadGroups() {
    const data = await fetchVariantGroupsByCategory(category._id).catch(() => [])
    setGroups(data)
  }

  useEffect(() => {
    let active = true

    async function run() {
      const data = await fetchVariantGroupsByCategory(category._id).catch(() => [])
      if (active) setGroups(data)
    }

    run()
    return () => {
      active = false
    }
  }, [category._id])

  async function handleSaveCategory() {
    setSaving(true)
    setError("")
    try {
      await updateCategory(category._id, {
        name: editName.trim(),
        image: editImage.trim(),
        order: Number(editOrder),
      })
      invalidateCategoriesCache()
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    await updateCategory(category._id, { isActive: !category.isActive }).catch(() => null)
    invalidateCategoriesCache()
    onRefresh()
  }

  async function handleDeactivateGroup(groupId) {
    await deleteVariantGroupForCategory(category._id, groupId).catch(() => null)
    loadGroups()
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 12, mt: 2, pt: 2, borderTop: "1px solid #e5e7eb" }}>
      {error && <ErrorMsg component="p">{error}</ErrorMsg>}

      <SectionLabel>Category settings</SectionLabel>
      <Box sx={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <FieldInput
          placeholder="Name"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          style={{ flex: 1, minWidth: 140 }}
        />
        <FieldInput
          placeholder="Image URL"
          value={editImage}
          onChange={(e) => setEditImage(e.target.value)}
          style={{ flex: 2, minWidth: 200 }}
        />
        <FieldInput
          placeholder="Order"
          type="number"
          value={editOrder}
          onChange={(e) => setEditOrder(e.target.value)}
          style={{ width: 80, flex: "none" }}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 8, alignItems: "center" }}>
        <PrimaryBtn type="button" onClick={handleSaveCategory} disabled={saving}>
          {saving ? "Saving..." : "Save"}
        </PrimaryBtn>
        <Toggle type="button" $active={category.isActive} onClick={handleToggleActive}>
          {category.isActive ? "Active" : "Inactive"}
        </Toggle>
      </Box>

      <SectionLabel sx={{ mt: 2 }}>Variant groups</SectionLabel>
      {groups.length === 0 && (
        <Typography sx={{ fontSize: 12, color: "text.secondary" }}>
          No variant groups yet.
        </Typography>
      )}
      {groups.map((group) => (
        <ExistingVariantGroupEditor
          key={group.groupId}
          categoryId={category._id}
          group={group}
          onSaved={loadGroups}
          onDeactivate={handleDeactivateGroup}
        />
      ))}

      {showGroupForm ? (
        <VariantGroupForm
          categoryId={category._id}
          onSaved={() => {
            loadGroups()
            setShowGroupForm(false)
          }}
        />
      ) : (
        <GhostBtn type="button" onClick={() => setShowGroupForm(true)} style={{ alignSelf: "flex-start" }}>
          + Add variant group
        </GhostBtn>
      )}
    </Box>
  )
}

export default function AdminCategories() {
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const [newName, setNewName] = useState("")
  const [newImage, setNewImage] = useState("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")

  async function load() {
    try {
      setLoading(true)
      const data = await fetchCategories({ includeInactive: true })
      setCategories(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required.")
      return
    }

    setCreating(true)
    setCreateError("")
    try {
      await createCategory({ name: newName.trim(), image: newImage.trim() })
      invalidateCategoriesCache()
      setNewName("")
      setNewImage("")
      await load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) return <Typography sx={{ p: 2 }}>Loading categories...</Typography>
  if (error) return <Typography sx={{ p: 2, color: "error.main" }}>{error}</Typography>

  return (
    <PageWrap>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Manage Categories
      </Typography>

      <Card>
        <Typography sx={{ fontWeight: 700, fontSize: 14 }}>New Category</Typography>
        {createError && <ErrorMsg component="p">{createError}</ErrorMsg>}
        <Box sx={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <FieldInput
            placeholder="Name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
            style={{ flex: 1, minWidth: 140 }}
          />
          <FieldInput
            placeholder="Image URL (optional)"
            value={newImage}
            onChange={(e) => setNewImage(e.target.value)}
            style={{ flex: 2, minWidth: 200 }}
          />
        </Box>
        <PrimaryBtn type="button" onClick={handleCreate} disabled={creating} style={{ alignSelf: "flex-start" }}>
          {creating ? "Creating..." : "Create Category"}
        </PrimaryBtn>
      </Card>

      {categories.map((category) => (
        <Card key={category._id} sx={{ opacity: category.isActive ? 1 : 0.6 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 12 }}>
            {category.image && (
              <img
                src={category.image}
                alt={category.name}
                width={40}
                height={40}
                style={{ borderRadius: 8, objectFit: "cover", flexShrink: 0 }}
              />
            )}
            <Box sx={{ flex: 1 }}>
              <Typography sx={{ fontWeight: 700, fontSize: 15 }}>{category.name}</Typography>
              <Typography sx={{ fontSize: 11, color: "#9ca3af" }}>
                order: {category.order} · slug: {category.slug}
              </Typography>
            </Box>
            <GhostBtn
              type="button"
              onClick={() => setExpandedId((prev) => (prev === category._id ? null : category._id))}
            >
              {expandedId === category._id ? "Collapse" : "Manage"}
            </GhostBtn>
          </Box>

          {expandedId === category._id && (
            <CategoryDetail category={category} onRefresh={load} />
          )}
        </Card>
      ))}

      {categories.length === 0 && (
        <Typography sx={{ color: "text.secondary" }}>
          No categories yet. Create one above.
        </Typography>
      )}
    </PageWrap>
  )
}
