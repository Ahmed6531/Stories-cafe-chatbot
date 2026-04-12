import { useEffect, useRef, useState } from "react"
import {
  fetchMenu,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,
  uploadMenuItemImage,
  invalidateCategoriesCache,
} from "../../API/menuApi"
import { submitMenuItem } from "../../components/admin/submitMenuItem"
import CategoryPicker from "../../components/admin/CategoryPicker"
import VariantGroupsField from "../../components/admin/VariantGroupsField"
import { normalizeVariantGroupIds } from "../../utils/variantGroups"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import Divider from "@mui/material/Divider"
import FormControl from "@mui/material/FormControl"
import FormControlLabel from "@mui/material/FormControlLabel"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Skeleton from "@mui/material/Skeleton"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Typography from "@mui/material/Typography"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined"
import { formatLL } from "../../utils/currency"
import {
  adminBadgeOptionalSx,
  adminBodySx,
  adminCardSx,
  adminDangerGhostButtonSx,
  adminGhostButtonSx,
  adminHintSx,
  adminInputSx,
  adminLabelSx,
  adminPageTitleSx,
  adminPalette,
  adminPrimaryButtonSx,
  adminSectionLabelSx,
  adminSelectSx,
  adminSmallButtonSx,
  adminTableWrapSx,
} from "../../components/admin/adminUi"

const EMPTY_FORM = {
  name: "",
  categoryId: null,
  subcategory: "",
  basePrice: "",
  description: "",
  isAvailable: true,
  isFeatured: false,
}

const tableHeadCellSx = {
  py: "11px",
  px: "14px",
  fontSize: 13,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  backgroundColor: adminPalette.surfaceSoft,
  whiteSpace: "nowrap",
}

const tableBodyCellSx = {
  py: "11px",
  px: "14px",
  fontSize: 13,
  color: adminPalette.textPrimary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  verticalAlign: "middle",
}

function getBooleanBadgeSx(isActive) {
  return {
    display: "inline-flex",
    alignItems: "center",
    borderRadius: "6px",
    px: 1,
    py: "2px",
    fontSize: 11,
    fontWeight: 500,
    backgroundColor: isActive ? adminPalette.infoBg : adminPalette.pageBg,
    color: isActive ? adminPalette.infoText : adminPalette.textSecondary,
  }
}

const pickerOverridesSx = {
  "& select": {
    ...adminSelectSx,
    fontFamily: "inherit",
  },
  "& input": {
    ...adminInputSx,
    fontFamily: "inherit",
  },
  "& button": {
    ...adminGhostButtonSx,
    fontFamily: "inherit",
  },
}

const variantGroupsOverridesSx = {
  "& > div > .MuiTypography-root:first-of-type": {
    display: "none",
  },
  "& select": {
    ...adminSelectSx,
    borderStyle: "solid",
  },
  "& button": {
    borderRadius: "8px",
    fontFamily: "inherit",
  },
}

const itemFormLabelSx = {
  ...adminLabelSx,
  color: "#525252",
  fontWeight: 600,
}

const itemFormHintSx = {
  ...adminHintSx,
  color: "#848484",
}

const itemFormErrorSx = {
  ...adminHintSx,
  color: adminPalette.danger,
  fontWeight: 500,
}

const itemInputTightSx = {
  ...adminInputSx,
  border: "0.5px solid rgba(0,0,0,0.18)",
  padding: "7px 10px",
}

const requiredAsteriskSx = {
  color: adminPalette.warningText,
  fontWeight: 600,
}

const dropdownMenuProps = {
  PaperProps: {
    sx: {
      mt: 0.5,
      borderRadius: "10px",
      border: "0.5px solid rgba(0,0,0,0.10)",
      boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
    },
  },
}

const itemSelectFieldSx = {
  "& .MuiOutlinedInput-notchedOutline": {
    border: "0.5px solid rgba(0,0,0,0.15)",
  },
  "& .MuiSelect-select": {
    padding: "8px 34px 8px 10px",
    fontSize: 13,
    color: adminPalette.textPrimary,
    backgroundColor: adminPalette.pageBg,
    borderRadius: "8px",
  },
  "& .MuiSvgIcon-root": {
    color: adminPalette.textTertiary,
    right: 10,
  },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: adminPalette.brandPrimary,
    boxShadow: "0 0 0 2px rgba(0,112,74,0.10)",
  },
}

function normalizeSubcategoryKey(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase()
}

function canonicalizeSubcategoryValue(value, options = []) {
  const trimmedValue = String(value || "").trim().replace(/\s+/g, " ")
  if (!trimmedValue) return ""

  const normalizedValue = normalizeSubcategoryKey(trimmedValue)
  const matchedOption = options.find((option) => normalizeSubcategoryKey(option) === normalizedValue)
  return matchedOption || trimmedValue
}

function AdminImagePlaceholder({ size = 48, radius = "8px", iconSize = 18 }) {
  return (
    <Box
      sx={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: adminPalette.pageBg,
        border: "0.5px solid rgba(0,0,0,0.10)",
        color: adminPalette.textTertiary,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <ImageOutlinedIcon sx={{ fontSize: iconSize }} />
    </Box>
  )
}

const skeletonCardSx = {
  border: "1px solid #e0e0e0",
  borderRadius: "12px",
  backgroundColor: "#fff",
  boxShadow: "0 0 6px rgba(0,0,0,0.06)",
  overflow: "hidden",
}

function ItemsTableSkeleton() {
  const rows = Array.from({ length: 6 })

  return (
    <Box sx={{ ...skeletonCardSx, overflowX: "auto" }} aria-hidden="true">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 1.4fr) 150px 110px 130px 110px 110px 150px",
          backgroundColor: adminPalette.surfaceSoft,
          borderBottom: "0.5px solid rgba(0,0,0,0.07)",
          minWidth: 940,
        }}
      >
        {["Name", "Category", "Image", "Base price", "Available", "Featured", "Actions"].map((key) => (
          <Box key={key} sx={{ px: "14px", py: "11px" }}>
            <Skeleton
              animation="wave"
              variant="text"
              width={key === "Name" ? "54%" : "62%"}
              height={18}
              sx={{ bgcolor: "#eceff1" }}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ minWidth: 940 }}>
        {rows.map((_, index) => (
          <Box
            key={`items-skeleton-row-${index}`}
            sx={{
              display: "grid",
              gridTemplateColumns: "minmax(180px, 1.4fr) 150px 110px 130px 110px 110px 150px",
              borderBottom: index === rows.length - 1 ? "none" : "0.5px solid rgba(0,0,0,0.07)",
              backgroundColor: adminPalette.surface,
            }}
          >
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="72%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="80%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "12px" }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={48}
                height={48}
                sx={{ borderRadius: "8px", bgcolor: "#eceff1" }}
              />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="78%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={42}
                height={24}
                sx={{ borderRadius: "6px", bgcolor: "#eceff1" }}
              />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={42}
                height={24}
                sx={{ borderRadius: "6px", bgcolor: "#eceff1" }}
              />
            </Box>
            <Box sx={{ px: "14px", py: "12px", display: "flex", gap: 8, alignItems: "center" }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={58}
                height={30}
                sx={{ borderRadius: "8px", bgcolor: "#eceff1" }}
              />
              <Skeleton
                animation="wave"
                variant="rounded"
                width={66}
                height={30}
                sx={{ borderRadius: "8px", bgcolor: "#eceff1" }}
              />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

function ItemFormSkeleton() {
  return (
    <Box sx={{ ...skeletonCardSx, p: { xs: 2, md: "16px 20px" } }} aria-hidden="true">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.75 }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Skeleton animation="wave" variant="text" width={84} height={18} sx={{ bgcolor: "#eceff1" }} />
            <Skeleton animation="wave" variant="text" width={168} height={24} sx={{ bgcolor: "#eceff1" }} />
            <Skeleton animation="wave" variant="text" width={250} height={18} sx={{ bgcolor: "#eceff1" }} />
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            <Skeleton animation="wave" variant="rounded" width={126} height={38} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          {Array.from({ length: 4 }).map((_, index) => (
            <Box key={`item-form-field-${index}`} sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
              <Skeleton animation="wave" variant="text" width={90} height={18} sx={{ bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="rounded" width="100%" height={40} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
              {index === 3 && (
                <Skeleton animation="wave" variant="text" width="76%" height={16} sx={{ bgcolor: "#eceff1" }} />
              )}
            </Box>
          ))}
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Skeleton animation="wave" variant="text" width={80} height={18} sx={{ bgcolor: "#eceff1" }} />
          <Skeleton animation="wave" variant="rounded" width="100%" height={104} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
          <Skeleton animation="wave" variant="text" width="34%" height={16} sx={{ bgcolor: "#eceff1" }} />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Skeleton animation="wave" variant="text" width={44} height={18} sx={{ bgcolor: "#eceff1" }} />
          <Box
            sx={{
              borderRadius: "12px",
              border: "1px dashed #e0e0e0",
              backgroundColor: adminPalette.surfaceSoft,
              p: 2,
              display: "flex",
              alignItems: "center",
              gap: 2,
            }}
          >
            <Skeleton animation="wave" variant="rounded" width={64} height={64} sx={{ borderRadius: "10px", bgcolor: "#eceff1" }} />
            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, flex: 1 }}>
              <Skeleton animation="wave" variant="text" width={110} height={20} sx={{ bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="text" width={180} height={18} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Skeleton animation="wave" variant="circular" width={34} height={34} sx={{ bgcolor: "#eceff1" }} />
          </Box>
          <Skeleton animation="wave" variant="text" width={220} height={16} sx={{ bgcolor: "#eceff1", mx: "auto" }} />
        </Box>

        <Box sx={{ borderTop: "0.5px solid rgba(0,0,0,0.08)" }} />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Skeleton animation="wave" variant="text" width={70} height={18} sx={{ bgcolor: "#eceff1" }} />
            <Skeleton animation="wave" variant="rounded" width={72} height={24} sx={{ borderRadius: "6px", bgcolor: "#eceff1" }} />
          </Box>
          <Skeleton animation="wave" variant="rounded" width="100%" height={76} sx={{ borderRadius: "12px", bgcolor: "#eceff1" }} />
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          {Array.from({ length: 2 }).map((_, index) => (
            <Box key={`item-checkbox-${index}`} sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <Skeleton animation="wave" variant="rounded" width={20} height={20} sx={{ borderRadius: "4px", bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="text" width={index === 0 ? 64 : 138} height={18} sx={{ bgcolor: "#eceff1" }} />
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}

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

  const [attachedGroups, setAttachedGroups] = useState([])
  const [dragSrcId, setDragSrcId] = useState(null)

  useEffect(() => {
    load()
  }, [])

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

  function validateForm(nextForm, subcategoryRequired) {
    if (!nextForm.name.trim()) return "Name is required"
    if (!nextForm.categoryId) return "Category is required"
    if (subcategoryRequired && !nextForm.subcategory.trim()) return "Subcategory is required"
    const priceNum = Number(nextForm.basePrice)
    if (Number.isNaN(priceNum) || priceNum < 0) return "Base price must be a number >= 0"
    return ""
  }

  async function onSubmit(e) {
    e.preventDefault()
    const nextForm = {
      ...form,
      subcategory: canonicalizeSubcategoryValue(form.subcategory, subcategoryOptions),
    }
    const msg = validateForm(nextForm, subcategoryRequired)
    if (msg) {
      setFormError(msg)
      return
    }
    setFormError("")

    await submitMenuItem({
      editingId,
      form: nextForm,
      variantGroups: attachedGroups,
      imageFile,
      createMenuItem,
      updateMenuItem,
      uploadMenuItemImage,
      fetchMenu,
      setItems,
      resetForm: () => {
        setForm(EMPTY_FORM)
        setAttachedGroups([])
      },
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

      invalidateCategoriesCache()

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
      categoryId: item.category?._id || null,
      subcategory: item.subcategory || "",
      basePrice: item.basePrice ?? "",
      description: item.description || "",
      isAvailable: item.isAvailable ?? true,
      isFeatured: item.isFeatured ?? false,
    })
    setAttachedGroups(normalizeVariantGroupIds(item.variantGroups))
    resetImage()
    setImagePreview(item.image || "")
    setFormError("")
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setAttachedGroups([])
    resetImage()
    setFormError("")
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={adminPageTitleSx}>Items</Typography>
          <Typography sx={{ ...adminBodySx, maxWidth: 760 }}>
            Maintain menu items, pricing, imagery, and category-scoped variant groups without
            touching the underlying item workflow.
          </Typography>
        </Box>
        <ItemFormSkeleton />
        <ItemsTableSkeleton />
      </Box>
    )
  }

  if (error) {
    return (
      <Box
        sx={{
          ...adminCardSx,
          borderColor: "#f5b7b1",
          backgroundColor: "#fff8f7",
        }}
      >
        <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.danger }}>
          {error}
        </Typography>
      </Box>
    )
  }

  const selectedCategory = form.categoryId
    ? items.find((i) => i.category?._id === form.categoryId)?.category
    : null
  const subcategoryOptions = selectedCategory?.subcategories?.length
    ? selectedCategory.subcategories.map((s) => s.name).sort()
    : [...new Set(items.map((i) => i.subcategory).filter(Boolean))].sort()
  const subcategoryRequired = Boolean(selectedCategory?.subcategories?.length)

  const imagePickerLabel = imageFile
    ? imageFile.name
    : imagePreview
      ? "Click to replace image"
      : "Click to choose image..."
  const fieldErrors = {
    name: formError === "Name is required" ? formError : "",
    category: formError === "Category is required" ? formError : "",
    subcategory: formError === "Subcategory is required" ? formError : "",
    price: formError === "Base price must be a number >= 0" ? formError : "",
  }
  const generalFormError =
    formError &&
    !fieldErrors.name &&
    !fieldErrors.category &&
    !fieldErrors.subcategory &&
    !fieldErrors.price
      ? formError
      : ""
  const nameInvalid = Boolean(fieldErrors.name)
  const categoryInvalid = Boolean(fieldErrors.category)
  const subcategoryInvalid = Boolean(fieldErrors.subcategory)
  const priceInvalid = Boolean(fieldErrors.price)
  const invalidFieldSx = {
    borderColor: "#d67b73",
    boxShadow: "0 0 0 2px rgba(192,57,43,0.08)",
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Typography sx={adminPageTitleSx}>Items</Typography>
        <Typography sx={{ ...adminBodySx, maxWidth: 760 }}>
          Maintain menu items, pricing, imagery, and category-scoped variant groups without
          touching the underlying item workflow.
        </Typography>
      </Box>

      <Box
        component="form"
        onSubmit={onSubmit}
        sx={{
          ...adminCardSx,
          display: "flex",
          flexDirection: "column",
          gap: 1.75,
          width: "100%",
          borderColor: "rgba(0,0,0,0.13)",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={adminSectionLabelSx}>Item details</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
              {editingId ? "Edit Menu Item" : "Add Menu Item"}
            </Typography>
            <Typography sx={itemFormHintSx}>
              {editingId
                ? "Update the details and save your changes."
                : "Fill in the details below to add it to your menu."}
            </Typography>
          </Box>
          <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
            {editingId && (
              <Button type="button" onClick={cancelEdit} sx={adminGhostButtonSx}>
                Cancel
              </Button>
            )}
            <Button type="submit" disabled={saving} sx={adminPrimaryButtonSx}>
              {saving ? "Saving..." : editingId ? "Save Changes" : "Add Menu Item"}
            </Button>
          </Box>
        </Box>

        {generalFormError && (
          <Box
            sx={{
              borderRadius: "8px",
              border: "0.5px solid #f5b7b1",
              backgroundColor: "#fff8f7",
              px: 1.25,
              py: 1,
            }}
          >
            <Typography sx={{ fontSize: 12, fontWeight: 500, color: adminPalette.danger }}>
              {generalFormError}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography component="label" htmlFor="item-name" sx={itemFormLabelSx}>
              Name <Box component="span" sx={requiredAsteriskSx}>*</Box>
            </Typography>
            <Box
              component="input"
              id="item-name"
              name="name"
              placeholder="Iced latte"
              value={form.name}
              onChange={onFormChange}
              sx={nameInvalid ? { ...itemInputTightSx, ...invalidFieldSx } : itemInputTightSx}
            />
            {fieldErrors.name && <Typography sx={itemFormErrorSx}>{fieldErrors.name}</Typography>}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={itemFormLabelSx}>
              Category <Box component="span" sx={requiredAsteriskSx}>*</Box>
            </Typography>
            <Box sx={categoryInvalid ? { ...pickerOverridesSx, "& select": { ...adminSelectSx, ...invalidFieldSx, fontFamily: "inherit" } } : pickerOverridesSx}>
              <CategoryPicker
                value={form.categoryId}
                onChange={(id) => {
                  setAttachedGroups([])
                  setForm((prev) => ({ ...prev, categoryId: id, subcategory: "" }))
                }}
              />
            </Box>
            {fieldErrors.category && (
              <Typography sx={itemFormErrorSx}>{fieldErrors.category}</Typography>
            )}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography component="label" htmlFor="item-price" sx={itemFormLabelSx}>
              Price <Box component="span" sx={requiredAsteriskSx}>*</Box>
            </Typography>
            <Box
              component="input"
              id="item-price"
              name="basePrice"
              placeholder="350000"
              value={form.basePrice}
              onChange={onFormChange}
              type="number"
              step="0.01"
              min="0"
              sx={priceInvalid ? { ...itemInputTightSx, ...invalidFieldSx } : itemInputTightSx}
            />
            {fieldErrors.price && <Typography sx={itemFormErrorSx}>{fieldErrors.price}</Typography>}
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography component="label" htmlFor="item-subcategory" sx={itemFormLabelSx}>
              Subcategory {subcategoryRequired && <Box component="span" sx={requiredAsteriskSx}>*</Box>}
            </Typography>
            {subcategoryRequired ? (
              <FormControl
                size="small"
                sx={subcategoryInvalid ? { ...itemSelectFieldSx, ...invalidFieldSx } : itemSelectFieldSx}
              >
                <Select
                  id="item-subcategory"
                  name="subcategory"
                  value={form.subcategory}
                  displayEmpty
                  onChange={onFormChange}
                  MenuProps={dropdownMenuProps}
                >
                  <MenuItem value="">
                    <em>Select subcategory</em>
                  </MenuItem>
                  {subcategoryOptions.map((subcategory) => (
                    <MenuItem key={subcategory} value={subcategory}>
                      {subcategory}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            ) : (
              <Box
                component="input"
                id="item-subcategory"
                name="subcategory"
                placeholder="Optional"
                value={form.subcategory}
                onChange={onFormChange}
                sx={subcategoryInvalid ? { ...itemInputTightSx, ...invalidFieldSx } : itemInputTightSx}
              />
            )}
            <Typography sx={subcategoryInvalid ? itemFormErrorSx : itemFormHintSx}>
              {fieldErrors.subcategory ||
                (subcategoryRequired
                  ? "Choose one of the existing subcategories for this category."
                  : "Optional unless this category already uses subcategories. Matching names are normalized automatically.")}
            </Typography>
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography component="label" htmlFor="item-description" sx={itemFormLabelSx}>
            Description
          </Typography>
          <Box
            component="textarea"
            id="item-description"
            name="description"
            placeholder="A short description shown to customers"
            value={form.description}
            onChange={onFormChange}
            rows={4}
            sx={{
              ...itemInputTightSx,
              resize: "vertical",
              minHeight: 104,
            }}
          />
          <Typography sx={itemFormHintSx}>
            Keep the customer-facing description concise and neutral.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={itemFormLabelSx}>
            Image
          </Typography>
          <Box
            component="label"
            sx={{
              position: "relative",
              border: "0.5px dashed rgba(0,0,0,0.18)",
              borderRadius: "12px",
              backgroundColor: adminPalette.surfaceSoft,
              p: 2,
              display: "flex",
              alignItems: "center",
              alignContent: "flex-start",
              flexWrap: "wrap",
              gap: 2,
              cursor: "pointer",
            }}
          >
            {imagePreview ? (
              <Box
                component="img"
                src={imagePreview}
                alt="Item preview"
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "10px",
                  objectFit: "cover",
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 64,
                  height: 64,
                  borderRadius: "10px",
                  backgroundColor: adminPalette.pageBg,
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: adminPalette.textTertiary,
                  flexShrink: 0,
                }}
              >
                <ImageOutlinedIcon />
              </Box>
            )}

            <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, minWidth: 0 }}>
              <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                Upload image
              </Typography>
              <Typography sx={{ ...adminBodySx, color: "#7a7a7a" }}>
                {imagePickerLabel}
              </Typography>
            </Box>

            {imageFile ? (
              <Box
                component="button"
                type="button"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  resetImage()
                }}
                sx={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  width: 28,
                  height: 28,
                  borderRadius: "999px",
                  border: "0.5px solid rgba(0,0,0,0.12)",
                  backgroundColor: adminPalette.pageBg,
                  color: adminPalette.textSecondary,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  fontSize: 16,
                  lineHeight: 1,
                  "&:hover": {
                    backgroundColor: adminPalette.surface,
                    color: adminPalette.textPrimary,
                  },
                }}
                aria-label="Remove selected image"
              >
                ×
              </Box>
            ) : (
              <Box
                sx={{
                  ml: "auto",
                  width: 34,
                  height: 34,
                  borderRadius: "999px",
                  backgroundColor: adminPalette.pageBg,
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  color: adminPalette.textPrimary,
                  display: { xs: "none", sm: "inline-flex" },
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <CloudUploadOutlinedIcon sx={{ fontSize: 18 }} />
              </Box>
            )}

            <Box
              component="input"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              sx={{ display: "none" }}
              onChange={onFileChange}
            />
          </Box>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
            <Typography sx={{ ...itemFormHintSx, fontStyle: "italic", textAlign: "center" }}>
              Images look best with a transparent background.
            </Typography>
          </Box>
        </Box>

        <Divider sx={{ borderColor: "rgba(0,0,0,0.08)" }} />

        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography sx={adminSectionLabelSx}>Options</Typography>
            <Box sx={adminBadgeOptionalSx}>{attachedGroups.length} attached</Box>
          </Box>
          <Box sx={variantGroupsOverridesSx}>
            <VariantGroupsField
              key={form.categoryId || "no-category"}
              categoryId={form.categoryId}
              attachedGroups={attachedGroups}
              setAttachedGroups={setAttachedGroups}
              dragSrcId={dragSrcId}
              setDragSrcId={setDragSrcId}
            />
          </Box>
        </Box>

        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <FormControlLabel
            control={
              <Checkbox
                name="isAvailable"
                checked={form.isAvailable}
                onChange={onFormChange}
                sx={{
                  color: adminPalette.textTertiary,
                  "&.Mui-checked": {
                    color: adminPalette.textPrimary,
                  },
                }}
              />
            }
            label={<Typography sx={adminLabelSx}>Available</Typography>}
            sx={{ m: 0 }}
          />

          <FormControlLabel
            control={
              <Checkbox
                name="isFeatured"
                checked={form.isFeatured}
                onChange={onFormChange}
                sx={{
                  color: adminPalette.textTertiary,
                  "&.Mui-checked": {
                    color: adminPalette.textPrimary,
                  },
                }}
              />
            }
            label={<Typography sx={adminLabelSx}>Featured on homepage</Typography>}
            sx={{ m: 0 }}
          />
        </Box>
      </Box>

      <Box sx={adminTableWrapSx}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell sx={tableHeadCellSx}>Name</TableCell>
              <TableCell sx={tableHeadCellSx}>Category</TableCell>
              <TableCell sx={tableHeadCellSx}>Image</TableCell>
              <TableCell sx={tableHeadCellSx}>Base price</TableCell>
              <TableCell sx={tableHeadCellSx}>Available</TableCell>
              <TableCell sx={tableHeadCellSx}>Featured</TableCell>
              <TableCell sx={tableHeadCellSx}>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.map((item) => (
              <TableRow
                key={item.id}
                sx={{
                  "&:hover": {
                    backgroundColor: "#fafaf9",
                  },
                  "&:last-of-type td": {
                    borderBottom: "none",
                  },
                }}
              >
                <TableCell sx={tableBodyCellSx}>{item.name}</TableCell>
                <TableCell sx={tableBodyCellSx}>{item.category?.name || "-"}</TableCell>
                <TableCell sx={tableBodyCellSx}>
                  {item.image ? (
                    <Box sx={{ position: "relative", width: 48, height: 48 }}>
                      <Box
                        component="img"
                        src={item.image}
                        alt={item.name}
                        sx={{
                          width: 48,
                          height: 48,
                          borderRadius: "8px",
                          objectFit: "cover",
                          display: "block",
                          border: "0.5px solid rgba(0,0,0,0.10)",
                        }}
                        onError={(e) => {
                          e.currentTarget.style.display = "none"
                          const fallback = e.currentTarget.nextElementSibling
                          if (fallback instanceof HTMLElement) {
                            fallback.style.display = "inline-flex"
                          }
                        }}
                      />
                      <Box sx={{ display: "none", position: "absolute", inset: 0 }}>
                        <AdminImagePlaceholder />
                      </Box>
                    </Box>
                  ) : (
                    <AdminImagePlaceholder />
                  )}
                </TableCell>
                <TableCell sx={tableBodyCellSx}>{formatLL(item.basePrice)}</TableCell>
                <TableCell sx={tableBodyCellSx}>
                  <Box sx={getBooleanBadgeSx(item.isAvailable)}>
                    {item.isAvailable ? "Yes" : "No"}
                  </Box>
                </TableCell>
                <TableCell sx={tableBodyCellSx}>
                  <Box sx={getBooleanBadgeSx(item.isFeatured)}>
                    {item.isFeatured ? "Yes" : "No"}
                  </Box>
                </TableCell>
                <TableCell sx={tableBodyCellSx}>
                  <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                    <Button
                      type="button"
                      onClick={() => startEdit(item)}
                      sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx }}
                    >
                      Edit
                    </Button>
                    <Button
                      type="button"
                      onClick={() => handleDelete(item.id)}
                      sx={{ ...adminDangerGhostButtonSx, ...adminSmallButtonSx }}
                    >
                      Delete
                    </Button>
                  </Box>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Box>
    </Box>
  )
}
