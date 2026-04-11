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
import FormControlLabel from "@mui/material/FormControlLabel"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Typography from "@mui/material/Typography"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined"
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

  function validateForm() {
    if (!form.name.trim()) return "Name is required"
    if (!form.categoryId) return "Category is required"
    if (!editingId && !imageFile && !imagePreview) return "Please select an image"
    const priceNum = Number(form.basePrice)
    if (Number.isNaN(priceNum) || priceNum < 0) return "Base price must be a number >= 0"
    return ""
  }

  async function onSubmit(e) {
    e.preventDefault()
    const msg = validateForm()
    if (msg) {
      setFormError(msg)
      return
    }
    setFormError("")

    await submitMenuItem({
      editingId,
      form,
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
      <Box sx={adminCardSx}>
        <Typography sx={adminBodySx}>Loading menu items...</Typography>
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

  const imagePickerLabel = imageFile
    ? imageFile.name
    : imagePreview
      ? "Click to replace image"
      : "Click to choose image..."

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
          gap: 2.25,
          width: "100%",
        }}
      >
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 2, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
            <Typography sx={adminSectionLabelSx}>Item details</Typography>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
              {editingId ? "Editing menu item" : "Create a new menu item"}
            </Typography>
          </Box>
          {editingId && (
            <Button type="button" onClick={cancelEdit} sx={adminGhostButtonSx}>
              Cancel edit
            </Button>
          )}
        </Box>

        {formError && (
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
              {formError}
            </Typography>
          </Box>
        )}

        <Box
          sx={{
            display: "grid",
            gap: 2,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography component="label" htmlFor="item-name" sx={adminLabelSx}>
              Name
            </Typography>
            <Box
              component="input"
              id="item-name"
              name="name"
              placeholder="Iced latte"
              value={form.name}
              onChange={onFormChange}
              sx={adminInputSx}
            />
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography sx={adminLabelSx}>Category</Typography>
            <Box sx={pickerOverridesSx}>
              <CategoryPicker
                value={form.categoryId}
                onChange={(id) => {
                  setAttachedGroups([])
                  setForm((prev) => ({ ...prev, categoryId: id, subcategory: "" }))
                }}
              />
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography component="label" htmlFor="item-price" sx={adminLabelSx}>
              Price
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
              sx={adminInputSx}
            />
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
            <Typography component="label" htmlFor="item-subcategory" sx={adminLabelSx}>
              Subcategory
            </Typography>
            <datalist id="subcategory-options">
              {subcategoryOptions.map((subcategory) => (
                <option key={subcategory} value={subcategory} />
              ))}
            </datalist>
            <Box
              component="input"
              id="item-subcategory"
              name="subcategory"
              placeholder="Hot, Iced, Frap"
              value={form.subcategory}
              onChange={onFormChange}
              list="subcategory-options"
              sx={adminInputSx}
            />
          </Box>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography component="label" htmlFor="item-description" sx={adminLabelSx}>
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
              ...adminInputSx,
              resize: "vertical",
              minHeight: 112,
            }}
          />
          <Typography sx={adminHintSx}>
            Keep the customer-facing description concise and neutral.
          </Typography>
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={adminLabelSx}>Image</Typography>
          <Box
            component="label"
            sx={{
              border: "0.5px dashed rgba(0,0,0,0.18)",
              borderRadius: "12px",
              backgroundColor: adminPalette.surfaceSoft,
              minHeight: 132,
              p: 2,
              display: "flex",
              alignItems: "center",
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
                  width: 84,
                  height: 84,
                  borderRadius: "10px",
                  objectFit: "cover",
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 84,
                  height: 84,
                  borderRadius: "10px",
                  backgroundColor: adminPalette.surface,
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
                Upload product image
              </Typography>
              <Typography sx={{ ...adminBodySx, color: adminPalette.textTertiary }}>
                {imagePickerLabel}
              </Typography>
              <Typography sx={adminHintSx}>
                JPG, PNG, WEBP, GIF, or AVIF. The current submit flow remains unchanged.
              </Typography>
            </Box>

            <Box
              sx={{
                ml: "auto",
                width: 34,
                height: 34,
                borderRadius: "999px",
                backgroundColor: adminPalette.surface,
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

            <Box
              component="input"
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              sx={{ display: "none" }}
              onChange={onFileChange}
            />
          </Box>
        </Box>

        <Divider sx={{ borderColor: "rgba(0,0,0,0.08)" }} />

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            <Typography sx={adminSectionLabelSx}>Variant groups</Typography>
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

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button type="submit" disabled={saving} sx={adminPrimaryButtonSx}>
            {saving ? "Saving..." : editingId ? "Save changes" : "Create item"}
          </Button>
          {editingId && (
            <Button type="button" onClick={cancelEdit} sx={adminGhostButtonSx}>
              Cancel
            </Button>
          )}
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
                    />
                  ) : (
                    <Typography sx={{ fontSize: 12, color: adminPalette.textTertiary }}>
                      No image
                    </Typography>
                  )}
                </TableCell>
                <TableCell sx={tableBodyCellSx}>L.L {item.basePrice?.toLocaleString()}</TableCell>
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
