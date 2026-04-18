import { useCallback, useEffect, useRef, useState } from "react"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Checkbox from "@mui/material/Checkbox"
import Divider from "@mui/material/Divider"
import Dialog from "@mui/material/Dialog"
import DialogActions from "@mui/material/DialogActions"
import DialogContent from "@mui/material/DialogContent"
import FormControlLabel from "@mui/material/FormControlLabel"
import IconButton from "@mui/material/IconButton"
import Skeleton from "@mui/material/Skeleton"
import Typography from "@mui/material/Typography"
import CloudUploadOutlinedIcon from "@mui/icons-material/CloudUploadOutlined"
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined"
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined"
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined"
import {
  fetchCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  uploadCategoryImage,
} from "../../API/categoryApi"
import {
  fetchVariantGroupsByCategory,
  createVariantGroupForCategory,
  updateVariantGroupForCategory,
  hardDeleteVariantGroupForCategory,
} from "../../API/variantGroupApi"
import { invalidateCategoriesCache } from "../../API/menuApi"
import {
  adminBadgeOptionalSx,
  adminBadgeRequiredSx,
  adminBodySx,
  adminCardSx,
  adminDangerGhostButtonSx,
  adminGhostButtonSx,
  adminHintSx,
  adminInnerPanelSx,
  adminInputSx,
  adminLabelSx,
  adminPageTitleSx,
  adminPalette,
  adminPrimaryButtonSx,
  adminSectionLabelSx,
  adminSmallButtonSx,
} from "../../components/admin/adminUi"

const hiddenEntityCardSx = {
  opacity: 0.62,
  backgroundColor: adminPalette.surfaceSoft,
}

const hiddenEntityPanelSx = {
  opacity: 0.58,
  pointerEvents: "none",
}

const visibilityToggleSx = {
  width: 32,
  height: 32,
  borderRadius: "999px",
  border: "0.5px solid rgba(0,0,0,0.10)",
  color: adminPalette.textSecondary,
  backgroundColor: adminPalette.pageBg,
  "&:hover": {
    backgroundColor: adminPalette.surface,
  },
  "&.Mui-disabled": {
    opacity: 0.55,
    color: adminPalette.textTertiary,
    backgroundColor: adminPalette.pageBg,
  },
}

function useObjectPreview(initialValue = "") {
  const [preview, setPreview] = useState(initialValue)

  useEffect(() => {
    return () => {
      if (preview?.startsWith("blob:")) {
        URL.revokeObjectURL(preview)
      }
    }
  }, [preview])

  const replacePreview = useCallback((nextPreview) => {
    setPreview((current) => {
      if (current?.startsWith("blob:")) {
        URL.revokeObjectURL(current)
      }
      return nextPreview
    })
  }, [])

  return [preview, replacePreview]
}

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
    suboptionLabel: option.suboptionLabel || "",
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
    suboptionLabel: option.suboptionLabel.trim(),
    suboptions: option.suboptions.map((suboption) => ({
      name: suboption.name.trim(),
      additionalPrice: parsePrice(suboption.additionalPrice),
    })),
  }))
}

function getVariantGroupRef(group) {
  if (!group || typeof group !== "object") {
    return ""
  }

  return typeof group.groupId === "string" ? group.groupId.trim() : ""
}

function groupMetaText(group) {
  const parts = []
  parts.push(`${group.options?.length || 0} options`)
  parts.push(group.isRequired ? "required" : "optional")
  parts.push(`max ${group.maxSelections ?? "any"}`)
  return parts.join(" · ")
}

function formatAdditionalPrice(value) {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0) {
    return null
  }
  return `+${amount}`
}

function StatusBadge({ children, required = false }) {
  return <Box sx={required ? adminBadgeRequiredSx : adminBadgeOptionalSx}>{children}</Box>
}

function ErrorNotice({ children }) {
  if (!children) return null

  return (
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
        {children}
      </Typography>
    </Box>
  )
}

function ConfirmActionDialog({
  open,
  title,
  message,
  confirmLabel,
  onClose,
  onConfirm,
  loading = false,
  requireDeleteText = false,
}) {
  const [confirmationText, setConfirmationText] = useState("")

  useEffect(() => {
    if (!open) {
      setConfirmationText("")
    }
  }, [open])

  const confirmDisabled = loading || (requireDeleteText && confirmationText.trim() !== "DELETE")

  return (
    <Dialog
      open={open}
      onClose={loading ? undefined : onClose}
      BackdropProps={{
        sx: {
          backgroundColor: "rgba(0,0,0,0.18)",
        },
      }}
      PaperProps={{
        sx: {
          width: "100%",
          maxWidth: "320px",
          mx: 2,
          p: "24px",
          borderRadius: "14px",
          border: "0.5px solid rgba(0,0,0,0.10)",
          boxShadow: "none",
          textAlign: "center",
          backgroundColor: "#ffffff",
        },
      }}
    >
      <DialogContent sx={{ p: 0 }}>
        <Typography
          sx={{
            fontSize: "15px",
            fontWeight: 600,
            color: adminPalette.textPrimary,
            lineHeight: 1.25,
          }}
        >
          {title}
        </Typography>
        <Typography
          sx={{
            mt: 0.75,
            fontSize: "12px",
            fontWeight: 500,
            color: adminPalette.textSecondary,
            lineHeight: 1.4,
            whiteSpace: "pre-line",
          }}
        >
          {message}
        </Typography>

        {requireDeleteText && (
          <Box
            component="input"
            value={confirmationText}
            onChange={(e) => setConfirmationText(e.target.value)}
            placeholder='Type "DELETE" to continue'
            sx={{
              ...adminInputSx,
              mt: 1.5,
              textAlign: "center",
              fontSize: 12,
            }}
          />
        )}
      </DialogContent>

      <DialogActions sx={{ p: 0, pt: 2, gap: 1.25 }}>
        <Button
          fullWidth
          onClick={onClose}
          disabled={loading}
          variant="outlined"
          sx={{
            minWidth: 0,
            flex: 1,
            borderRadius: "9px",
            border: "0.5px solid rgba(0,0,0,0.10)",
            backgroundColor: "transparent",
            color: adminPalette.textSecondary,
            fontSize: "13px",
            fontWeight: 500,
            textTransform: "none",
            py: 0.95,
            "&:hover": {
              border: "0.5px solid rgba(0,0,0,0.10)",
              backgroundColor: "transparent",
            },
          }}
        >
          Cancel
        </Button>
        <Button
          fullWidth
          onClick={onConfirm}
          disabled={confirmDisabled}
          variant="contained"
          sx={{
            minWidth: 0,
            flex: 1,
            borderRadius: "9px",
            border: "none",
            boxShadow: "none",
            backgroundColor: "#f5ebe9",
            color: "#a93226",
            fontSize: "13px",
            fontWeight: 600,
            textTransform: "none",
            py: 0.95,
            "&:hover": {
              backgroundColor: "#f5ebe9",
              boxShadow: "none",
            },
            "&.Mui-disabled": {
              backgroundColor: "#f5ebe9",
              color: "rgba(169,50,38,0.55)",
            },
          }}
        >
          {loading ? `${confirmLabel}...` : confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function UploadArea({ hasFile, preview, label, inputRef, onChange, alt, onClear, disabled = false }) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Box
        component="label"
        sx={{
          position: "relative",
          border: `0.5px dashed ${hasFile ? "rgba(0,0,0,0.24)" : "rgba(0,0,0,0.18)"}`,
          borderRadius: "12px",
          backgroundColor: adminPalette.surfaceSoft,
          p: 2,
          display: "flex",
          alignItems: "center",
          alignContent: "flex-start",
          flexWrap: "wrap",
          gap: 2,
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {preview ? (
          <Box
            component="img"
            src={preview}
            alt={alt}
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
          <Typography sx={{ ...adminBodySx, color: adminPalette.textTertiary }}>
            {label}
          </Typography>
        </Box>

        {hasFile && onClear ? (
          <Box
            component="button"
            type="button"
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onClear()
            }}
            disabled={disabled}
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
              cursor: disabled ? "default" : "pointer",
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
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
          sx={{ display: "none" }}
          disabled={disabled}
          onChange={onChange}
        />
      </Box>
    </Box>
  )
}

function VisibilityToggleButton({ visible, onClick, disabled = false, label }) {
  return (
    <IconButton
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      sx={visibilityToggleSx}
    >
      {visible ? <VisibilityOutlinedIcon sx={{ fontSize: 18 }} /> : <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />}
    </IconButton>
  )
}

const skeletonCardSx = {
  border: "1px solid #e0e0e0",
  borderRadius: "12px",
  backgroundColor: "#fff",
  boxShadow: "0 0 6px rgba(0,0,0,0.06)",
  overflow: "hidden",
}

function CategoryFormSkeleton() {
  return (
    <Box sx={{ ...skeletonCardSx, p: { xs: 2, md: "16px 20px" } }} aria-hidden="true">
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Skeleton animation="wave" variant="text" width={94} height={18} sx={{ bgcolor: "#eceff1" }} />
          <Skeleton animation="wave" variant="text" width={140} height={24} sx={{ bgcolor: "#eceff1" }} />
        </Box>

        <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
          <Skeleton animation="wave" variant="rounded" width="100%" height={40} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
        </Box>

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
        <Skeleton animation="wave" variant="rounded" width={132} height={38} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
      </Box>
    </Box>
  )
}

function CategoryRowSkeleton({ expanded = false }) {
  return (
    <Box sx={{ ...skeletonCardSx, p: 2 }} aria-hidden="true">
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
        <Skeleton animation="wave" variant="rounded" width={44} height={44} sx={{ borderRadius: "10px", bgcolor: "#eceff1" }} />
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Skeleton animation="wave" variant="text" width={160} height={24} sx={{ bgcolor: "#eceff1" }} />
          <Skeleton animation="wave" variant="text" width={124} height={16} sx={{ bgcolor: "#eceff1" }} />
        </Box>
        <Skeleton animation="wave" variant="rounded" width={78} height={30} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
      </Box>

      {expanded && (
        <Box
          sx={{
            mt: 2,
            pt: 2,
            borderTop: "0.5px solid rgba(0,0,0,0.08)",
            backgroundColor: adminPalette.surfaceSoft,
            borderRadius: "0 0 12px 12px",
            px: { xs: 1.5, md: 2 },
            pb: { xs: 1.5, md: 2 },
            display: "flex",
            flexDirection: "column",
            gap: 2,
          }}
        >
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
            <Skeleton animation="wave" variant="text" width={110} height={18} sx={{ bgcolor: "#eceff1" }} />
            <Box
              sx={{
                display: "grid",
                gap: 1,
                gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 120px" },
              }}
            >
              <Skeleton animation="wave" variant="rounded" width="100%" height={40} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="rounded" width="100%" height={40} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
            </Box>
            <Box
              sx={{
                borderRadius: "12px",
                border: "1px dashed #e0e0e0",
                backgroundColor: adminPalette.surface,
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
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              <Skeleton animation="wave" variant="rounded" width={86} height={38} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="rounded" width={82} height={38} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="rounded" width={74} height={38} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
            </Box>
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
                <Skeleton animation="wave" variant="text" width={96} height={18} sx={{ bgcolor: "#eceff1" }} />
                <Skeleton animation="wave" variant="text" width={230} height={16} sx={{ bgcolor: "#eceff1" }} />
              </Box>
              <Skeleton animation="wave" variant="rounded" width={120} height={30} sx={{ borderRadius: "8px", bgcolor: "#eceff1" }} />
            </Box>
            <Skeleton animation="wave" variant="rounded" width="100%" height={72} sx={{ borderRadius: "12px", bgcolor: "#eceff1" }} />
          </Box>
        </Box>
      )}
    </Box>
  )
}

function VariantGroupPreview({ adminName, customerLabel, isRequired, maxSelections, options }) {
  const title = customerLabel.trim() || adminName.trim() || "Variant group"
  const helper = isRequired
    ? maxSelections
      ? `Required · choose up to ${maxSelections}`
      : "Required"
    : maxSelections
      ? `Optional · choose up to ${maxSelections}`
      : "Optional"

  return (
    <Box
      sx={{
        ...adminCardSx,
        p: 2,
        alignSelf: "start",
        position: { lg: "sticky" },
        top: { lg: 88 },
      }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5, mb: 2 }}>
        <Typography sx={adminSectionLabelSx}>Live preview</Typography>
        <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
          {title}
        </Typography>
        <Typography sx={adminHintSx}>{helper}</Typography>
      </Box>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
        {options.length === 0 ? (
          <Box sx={{ ...adminInnerPanelSx, p: 1.5 }}>
            <Typography sx={adminBodySx}>Add options on the left to see the customer preview here.</Typography>
          </Box>
        ) : (
          options.map((option, optionIndex) => (
            <Box
              key={`preview-option-${optionIndex}`}
              sx={{
                ...adminInnerPanelSx,
                p: 1.5,
                display: "flex",
                flexDirection: "column",
                gap: 0.75,
              }}
            >
              <Box sx={{ display: "flex", alignItems: "flex-start", gap: 1 }}>
                <Box
                  sx={{
                    width: 14,
                    height: 14,
                    borderRadius: "999px",
                    border: "1px solid rgba(0,0,0,0.22)",
                    mt: "2px",
                    flexShrink: 0,
                  }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                    {option.name || `Option ${optionIndex + 1}`}
                  </Typography>
                  {formatAdditionalPrice(option.additionalPrice) && (
                    <Typography sx={adminHintSx}>{formatAdditionalPrice(option.additionalPrice)}</Typography>
                  )}
                </Box>
              </Box>

              {option.suboptions.length > 0 && (
                <Box sx={{ pl: 3, display: "flex", flexDirection: "column", gap: 0.5 }}>
                  {option.suboptionLabel && (
                    <Typography sx={adminHintSx}>{option.suboptionLabel}</Typography>
                  )}
                  {option.suboptions.map((suboption, suboptionIndex) => (
                    <Typography
                      key={`preview-suboption-${optionIndex}-${suboptionIndex}`}
                      sx={{ fontSize: 12, color: adminPalette.textSecondary }}
                    >
                      {suboption.name || `Suboption ${suboptionIndex + 1}`}
                      {formatAdditionalPrice(suboption.additionalPrice)
                        ? ` (${formatAdditionalPrice(suboption.additionalPrice)})`
                        : ""}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))
        )}
      </Box>
    </Box>
  )
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
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25 }}>
      <Typography sx={adminSectionLabelSx}>Options</Typography>

      {options.length === 0 && (
        <Box sx={{ ...adminInnerPanelSx, p: 1.5 }}>
          <Typography sx={adminBodySx}>No options yet. Add one below.</Typography>
        </Box>
      )}

      {options.map((option, optionIndex) => (
        <Box
          key={`option-${optionIndex}`}
          sx={{
            ...adminInnerPanelSx,
            p: 1.5,
            display: "flex",
            flexDirection: "column",
            gap: 1.25,
          }}
        >
          <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
            <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
              Option {optionIndex + 1}
            </Typography>
            <Button
              type="button"
              onClick={() => removeOption(optionIndex)}
              disabled={disabled}
              sx={{ ...adminDangerGhostButtonSx, ...adminSmallButtonSx }}
            >
              Remove option
            </Button>
          </Box>

          <Box
            sx={{
              display: "grid",
              gap: 1,
              gridTemplateColumns: { xs: "1fr", md: "repeat(3, minmax(0, 1fr)) 120px" },
            }}
          >
            <Box
              component="input"
              placeholder="Option name *"
              value={option.name}
              onChange={(e) => updateOption(optionIndex, (current) => ({ ...current, name: e.target.value }))}
              disabled={disabled}
              sx={adminInputSx}
            />
            <Box
              component="input"
              placeholder="Additional price"
              type="number"
              step="0.01"
              value={option.additionalPrice}
              onChange={(e) =>
                updateOption(optionIndex, (current) => ({ ...current, additionalPrice: e.target.value }))
              }
              disabled={disabled}
              sx={adminInputSx}
            />
            <Box
              component="input"
              placeholder="Suboption label"
              value={option.suboptionLabel}
              onChange={(e) =>
                updateOption(optionIndex, (current) => ({ ...current, suboptionLabel: e.target.value }))
              }
              disabled={disabled}
              sx={adminInputSx}
            />
            <FormControlLabel
              control={
                <Checkbox
                  checked={option.isActive}
                  onChange={(e) =>
                    updateOption(optionIndex, (current) => ({ ...current, isActive: e.target.checked }))
                  }
                  disabled={disabled}
                  sx={{
                    color: adminPalette.textTertiary,
                    "&.Mui-checked": { color: adminPalette.textPrimary },
                  }}
                />
              }
              label={<Typography sx={adminLabelSx}>Active</Typography>}
              sx={{ m: 0 }}
            />
          </Box>

          <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
            <Typography sx={adminSectionLabelSx}>Suboptions</Typography>

            {option.suboptions.length === 0 && (
              <Typography sx={adminBodySx}>No suboptions for this option yet.</Typography>
            )}

            {option.suboptions.map((suboption, suboptionIndex) => (
              <Box
                key={`option-${optionIndex}-suboption-${suboptionIndex}`}
                sx={{
                  ...adminInnerPanelSx,
                  p: 1.25,
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 160px auto" },
                }}
              >
                <Box
                  component="input"
                  placeholder="Suboption name *"
                  value={suboption.name}
                  onChange={(e) =>
                    updateSuboption(optionIndex, suboptionIndex, (current) => ({
                      ...current,
                      name: e.target.value,
                    }))
                  }
                  disabled={disabled}
                  sx={adminInputSx}
                />
                <Box
                  component="input"
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
                  disabled={disabled}
                  sx={adminInputSx}
                />
                <Button
                  type="button"
                  onClick={() => removeSuboption(optionIndex, suboptionIndex)}
                  disabled={disabled}
                  sx={{ ...adminDangerGhostButtonSx, ...adminSmallButtonSx }}
                >
                  Remove
                </Button>
              </Box>
            ))}

            <Button
              type="button"
              onClick={() => addSuboption(optionIndex)}
              disabled={disabled}
              sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx, alignSelf: "flex-start" }}
            >
              + Add suboption
            </Button>
          </Box>
        </Box>
      ))}

      <Button
        type="button"
        onClick={addOption}
        disabled={disabled}
        sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx, alignSelf: "flex-start" }}
      >
        + Add option
      </Button>
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
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.25fr) minmax(280px, 0.75fr)" },
      }}
    >
      <Box sx={{ ...adminCardSx, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={adminSectionLabelSx}>Variant groups</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
            New variant group
          </Typography>
        </Box>

        <ErrorNotice>{error}</ErrorNotice>

        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr)) 140px" },
          }}
        >
          <Box
            component="input"
            placeholder="Admin name *"
            value={adminName}
            onChange={(e) => setAdminName(e.target.value)}
            sx={adminInputSx}
          />
          <Box
            component="input"
            placeholder="Customer label"
            value={customerLabel}
            onChange={(e) => setCustomerLabel(e.target.value)}
            sx={adminInputSx}
          />
          <Box
            component="input"
            placeholder="Max selections"
            type="number"
            min="1"
            value={maxSelections}
            onChange={(e) => setMaxSelections(e.target.value)}
            sx={adminInputSx}
          />
        </Box>

        <FormControlLabel
          control={
            <Checkbox
              checked={isRequired}
              onChange={(e) => setIsRequired(e.target.checked)}
              sx={{
                color: adminPalette.textTertiary,
                "&.Mui-checked": { color: adminPalette.textPrimary },
              }}
            />
          }
          label={<Typography sx={adminLabelSx}>Required</Typography>}
          sx={{ m: 0 }}
        />

        <VariantOptionsEditor options={options} setOptions={setOptions} disabled={saving} />

        <Button
          type="button"
          onClick={handleSubmit}
          disabled={saving}
          sx={{ ...adminPrimaryButtonSx, alignSelf: "flex-start" }}
        >
          {saving ? "Adding..." : "Add group"}
        </Button>
      </Box>

      <VariantGroupPreview
        adminName={adminName}
        customerLabel={customerLabel}
        isRequired={isRequired}
        maxSelections={maxSelections}
        options={options}
      />
    </Box>
  )
}

function ExistingVariantGroupEditor({ categoryId, group, onSaved }) {
  const [editing, setEditing] = useState(false)
  const [customerLabel, setCustomerLabel] = useState(group.customerLabel || "")
  const [isRequired, setIsRequired] = useState(group.isRequired === true)
  const [maxSelections, setMaxSelections] = useState(group.maxSelections ?? "")
  const [options, setOptions] = useState(
    Array.isArray(group.options) ? group.options.map(createOptionDraft) : [],
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteDialog, setDeleteDialog] = useState({ open: false, cascade: false, menuItems: 0 })
  const isVisible = group.isActive !== false

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
      await updateVariantGroupForCategory(categoryId, getVariantGroupRef(group), {
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

  async function handleToggleVisibility() {
    setSaving(true)
    setError("")
    try {
      await updateVariantGroupForCategory(categoryId, getVariantGroupRef(group), {
        isActive: !isVisible,
      })
      setEditing(false)
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeletePermanently() {
    setSaving(true)
    setError("")
    try {
      await hardDeleteVariantGroupForCategory(categoryId, getVariantGroupRef(group))
      setDeleteDialog({ open: false, cascade: false, menuItems: 0 })
      onSaved()
    } catch (err) {
      if (err?.status === 409 && err?.data?.requiresCascade) {
        setDeleteDialog({
          open: true,
          cascade: true,
          menuItems: err.data?.usage?.menuItems ?? 0,
        })
      } else {
        setError(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCascadeDeletePermanently() {
    setSaving(true)
    setError("")
    try {
      await hardDeleteVariantGroupForCategory(categoryId, getVariantGroupRef(group), { cascade: true })
      setDeleteDialog({ open: false, cascade: false, menuItems: 0 })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        ...adminCardSx,
        ...(isVisible ? null : hiddenEntityCardSx),
        p: 2,
        display: "flex",
        flexDirection: "column",
        gap: 1.5,
      }}
    >
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 1.5, flexWrap: "wrap" }}>
        <Box sx={{ flex: 1, minWidth: 220 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.5 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
              {group.adminName}
            </Typography>
            <StatusBadge required={group.isRequired}>{group.isRequired ? "Required" : "Optional"}</StatusBadge>
            {!isVisible && <StatusBadge>Hidden</StatusBadge>}
          </Box>
          <Typography sx={{ fontSize: 12, color: adminPalette.textSecondary, mb: 0.75 }}>
            Shows as: {group.customerLabel || group.adminName}
          </Typography>
          <Typography sx={{ fontSize: 11, color: adminPalette.textTertiary }}>
            {groupMetaText(group)} · ref: {getVariantGroupRef(group)}
          </Typography>
        </Box>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button
            type="button"
            onClick={() => (editing ? handleCancel() : setEditing(true))}
            disabled={!isVisible || saving}
            sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx }}
          >
            {editing ? "Close editor" : "Manage options"}
          </Button>
          <VisibilityToggleButton
            visible={isVisible}
            onClick={handleToggleVisibility}
            disabled={saving}
            label={isVisible ? "Hide variant group from customers" : "Show variant group to customers"}
          />
          <Button
            type="button"
            onClick={() => setDeleteDialog({ open: true, cascade: false, menuItems: 0 })}
            disabled={!isVisible || saving}
            sx={{ ...adminDangerGhostButtonSx, ...adminSmallButtonSx }}
          >
            Delete
          </Button>
        </Box>
      </Box>

      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", ...(isVisible ? null : hiddenEntityPanelSx) }}>
        {group.options?.map((option, optionIndex) => (
          <Box
            key={`${getVariantGroupRef(group)}-option-${optionIndex}`}
            sx={{
              borderRadius: "999px",
              backgroundColor: adminPalette.pageBg,
              px: 1.25,
              py: 0.5,
              fontSize: 11,
              color: adminPalette.textSecondary,
            }}
          >
            {option.name}
          </Box>
        ))}
      </Box>

      {editing && isVisible && (
        <>
          <Divider sx={{ borderColor: "rgba(0,0,0,0.08)" }} />
          <ErrorNotice>{error}</ErrorNotice>

          <Box
            sx={{
              display: "grid",
              gap: 2,
              gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1.25fr) minmax(280px, 0.75fr)" },
            }}
          >
            <Box sx={{ ...adminInnerPanelSx, p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
              <Typography sx={adminSectionLabelSx}>Edit group</Typography>

              <Box
                sx={{
                  display: "grid",
                  gap: 1,
                  gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr)) 140px" },
                }}
              >
                <Box
                  component="input"
                  value={group.adminName}
                  disabled
                  sx={{
                    ...adminInputSx,
                    backgroundColor: adminPalette.surfaceSoft,
                  }}
                />
                <Box
                  component="input"
                  placeholder="Customer label"
                  value={customerLabel}
                  onChange={(e) => setCustomerLabel(e.target.value)}
                  sx={adminInputSx}
                />
                <Box
                  component="input"
                  placeholder="Max selections"
                  type="number"
                  min="1"
                  value={maxSelections}
                  onChange={(e) => setMaxSelections(e.target.value)}
                  sx={adminInputSx}
                />
              </Box>

              <FormControlLabel
                control={
                  <Checkbox
                    checked={isRequired}
                    onChange={(e) => setIsRequired(e.target.checked)}
                    sx={{
                      color: adminPalette.textTertiary,
                      "&.Mui-checked": { color: adminPalette.textPrimary },
                    }}
                  />
                }
                label={<Typography sx={adminLabelSx}>Required</Typography>}
                sx={{ m: 0 }}
              />

              <VariantOptionsEditor options={options} setOptions={setOptions} disabled={saving} />

              <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
                <Button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  sx={adminPrimaryButtonSx}
                >
                  {saving ? "Saving..." : "Save group"}
                </Button>
                <Button type="button" onClick={handleCancel} sx={adminGhostButtonSx}>
                  Cancel
                </Button>
              </Box>
            </Box>

            <VariantGroupPreview
              adminName={group.adminName}
              customerLabel={customerLabel}
              isRequired={isRequired}
              maxSelections={maxSelections}
              options={options}
            />
          </Box>
        </>
      )}

      <ConfirmActionDialog
        open={deleteDialog.open}
        title={deleteDialog.cascade ? "Cascade delete variant group?" : "Delete variant group?"}
        message={
          deleteDialog.cascade
            ? `This variant group is used by ${deleteDialog.menuItems} menu item${deleteDialog.menuItems === 1 ? "" : "s"}.\nDeleting it will remove this option group from those items and may change active cart pricing.`
            : `Delete "${group.adminName}" permanently?`
        }
        confirmLabel="Delete"
        onClose={() => {
          if (saving) return
          setDeleteDialog({ open: false, cascade: false, menuItems: 0 })
        }}
        onConfirm={deleteDialog.cascade ? handleCascadeDeletePermanently : handleDeletePermanently}
        loading={saving}
        requireDeleteText={deleteDialog.cascade}
      />
    </Box>
  )
}

function CategoryDetail({ category, onRefresh }) {
  const [groups, setGroups] = useState([])
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [editName, setEditName] = useState(category.name)
  const [editImage, setEditImage] = useState(category.image || "")
  const [editOrder, setEditOrder] = useState(category.order ?? 0)
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useObjectPreview(category.image || "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [deleteDialog, setDeleteDialog] = useState({ open: false, cascade: false, menuItems: 0, variantGroups: 0 })
  const fileInputRef = useRef(null)
  const isVisible = category.isActive !== false

  async function loadGroups() {
    const data = await fetchVariantGroupsByCategory(category._id, { includeInactive: true }).catch(() => [])
    setGroups(data)
  }

  useEffect(() => {
    let active = true

    async function run() {
      const data = await fetchVariantGroupsByCategory(category._id, { includeInactive: true }).catch(() => [])
      if (active) setGroups(data)
    }

    run()
    return () => {
      active = false
    }
  }, [category._id])

  useEffect(() => {
    setEditName(category.name)
    setEditImage(category.image || "")
    setEditOrder(category.order ?? 0)
    setImageFile(null)
    setImagePreview(category.image || "")
    if (fileInputRef.current) fileInputRef.current.value = ""
  }, [category._id, category.name, category.image, category.order, setImagePreview])

  useEffect(() => {
    if (!isVisible) {
      setShowGroupForm(false)
    }
  }, [isVisible])

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImageFile(file)
    setImagePreview(URL.createObjectURL(file))
  }

  function clearSelectedFile() {
    setImageFile(null)
    setImagePreview(editImage.trim())
    if (fileInputRef.current) fileInputRef.current.value = ""
  }

  async function handleSaveCategory() {
    setSaving(true)
    setError("")
    try {
      await updateCategory(category._id, {
        name: editName.trim(),
        image: editImage.trim(),
        order: Number(editOrder),
      })
      if (imageFile) {
        await uploadCategoryImage(category._id, imageFile)
      }
      invalidateCategoriesCache()
      clearSelectedFile()
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleToggleActive() {
    setSaving(true)
    setError("")
    try {
      await updateCategory(category._id, { isActive: !isVisible })
      invalidateCategoriesCache()
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteCategory() {
    setSaving(true)
    setError("")
    try {
      await deleteCategory(category._id)
      setDeleteDialog({ open: false, cascade: false, menuItems: 0, variantGroups: 0 })
      invalidateCategoriesCache()
      onRefresh()
    } catch (err) {
      if (err?.status === 409 && err?.data?.requiresCascade) {
        setDeleteDialog({
          open: true,
          cascade: true,
          menuItems: err.data?.usage?.menuItems ?? 0,
          variantGroups: err.data?.usage?.variantGroups ?? 0,
        })
      } else {
        setError(err.message)
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleCascadeDeleteCategory() {
    setSaving(true)
    setError("")
    try {
      await deleteCategory(category._id, { cascade: true })
      setDeleteDialog({ open: false, cascade: false, menuItems: 0, variantGroups: 0 })
      invalidateCategoriesCache()
      onRefresh()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Box
      sx={{
        mt: 2,
        pt: 2,
        borderTop: "0.5px solid rgba(0,0,0,0.08)",
        backgroundColor: adminPalette.surfaceSoft,
        borderRadius: "0 0 12px 12px",
        px: { xs: 1.5, md: 2 },
        pb: { xs: 1.5, md: 2 },
        display: "flex",
        flexDirection: "column",
        gap: 2,
      }}
    >
      <ErrorNotice>{error}</ErrorNotice>

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.25, ...(isVisible ? null : hiddenEntityPanelSx) }}>
        <Typography sx={adminSectionLabelSx}>Category settings</Typography>

        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 120px" },
          }}
        >
          <Box
            component="input"
            placeholder="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            disabled={!isVisible || saving}
            sx={adminInputSx}
          />
          <Box
            component="input"
            placeholder="Order"
            type="number"
            value={editOrder}
            onChange={(e) => setEditOrder(e.target.value)}
            disabled={!isVisible || saving}
            sx={adminInputSx}
          />
        </Box>

        <UploadArea
          hasFile={!!imageFile || !!imagePreview}
          preview={imagePreview}
          label={imageFile ? imageFile.name : imagePreview ? "Click to replace image" : "Click to choose image..."}
          inputRef={fileInputRef}
          onChange={handleFileChange}
          alt={`${category.name} preview`}
          onClear={imageFile ? clearSelectedFile : null}
          disabled={!isVisible || saving}
        />
        <Typography sx={{ ...adminHintSx, fontStyle: "italic", textAlign: "center" }}>
          Images look best with a transparent background.
        </Typography>

        <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
          <Button type="button" onClick={handleSaveCategory} disabled={!isVisible || saving} sx={adminPrimaryButtonSx}>
            {saving ? "Saving..." : "Save"}
          </Button>
          <Button
            type="button"
            onClick={() => setDeleteDialog({ open: true, cascade: false, menuItems: 0, variantGroups: 0 })}
            disabled={!isVisible || saving}
            sx={adminDangerGhostButtonSx}
          >
            Delete
          </Button>
        </Box>
      </Box>

      {!isVisible && (
        <Typography sx={{ ...adminHintSx, mt: -0.5 }}>
          Hidden categories stay visible in admin, but editing is locked until you show them again.
        </Typography>
      )}

      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, ...(isVisible ? null : hiddenEntityPanelSx) }}>
        <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
          <Box sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
            <Typography sx={adminSectionLabelSx}>Variant groups</Typography>
            <Typography sx={{ fontSize: 13, color: adminPalette.textSecondary }}>
              Each group defines how customers choose add-ons for this category.
            </Typography>
          </Box>
          <Button
            type="button"
            onClick={() => setShowGroupForm((prev) => !prev)}
            disabled={!isVisible}
            sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx }}
          >
            {showGroupForm ? "Close panel" : "+ Add variant group"}
          </Button>
        </Box>

        {showGroupForm && (
          <VariantGroupForm
            categoryId={category._id}
            onSaved={() => {
              loadGroups()
              setShowGroupForm(false)
            }}
          />
        )}

        {groups.length === 0 && !showGroupForm && (
          <Box sx={{ ...adminCardSx, p: 2 }}>
            <Typography sx={adminBodySx}>No variant groups yet.</Typography>
          </Box>
        )}

        {groups.map((group) => (
          <ExistingVariantGroupEditor
            key={getVariantGroupRef(group) || group.adminName}
            categoryId={category._id}
            group={group}
            onSaved={loadGroups}
          />
        ))}
      </Box>

      <ConfirmActionDialog
        open={deleteDialog.open}
        title={deleteDialog.cascade ? "Cascade delete category?" : "Delete category?"}
        message={
          deleteDialog.cascade
            ? `This will delete ${deleteDialog.menuItems} menu item${deleteDialog.menuItems === 1 ? "" : "s"} and ${deleteDialog.variantGroups} variant group${deleteDialog.variantGroups === 1 ? "" : "s"} in "${category.name}".\nActive customer carts may lose these items.`
            : `Delete "${category.name}" permanently?\nIf it is still in use, you'll get a second cascade confirmation.`
        }
        confirmLabel="Delete"
        onClose={() => {
          if (saving) return
          setDeleteDialog({ open: false, cascade: false, menuItems: 0, variantGroups: 0 })
        }}
        onConfirm={deleteDialog.cascade ? handleCascadeDeleteCategory : handleDeleteCategory}
        loading={saving}
        requireDeleteText={deleteDialog.cascade}
      />
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
  const [newImageFile, setNewImageFile] = useState(null)
  const [newImagePreview, setNewImagePreview] = useObjectPreview("")
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState("")
  const createFileInputRef = useRef(null)

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

  function handleNewFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setNewImageFile(file)
    setNewImagePreview(URL.createObjectURL(file))
  }

  function resetNewImageSelection() {
    setNewImageFile(null)
    setNewImagePreview("")
    if (createFileInputRef.current) createFileInputRef.current.value = ""
  }

  async function handleCreate() {
    if (!newName.trim()) {
      setCreateError("Name is required.")
      return
    }

    setCreating(true)
    setCreateError("")
    try {
      const created = await createCategory({ name: newName.trim(), image: newImage.trim() })
      if (newImageFile) {
        await uploadCategoryImage(created._id, newImageFile)
      }
      invalidateCategoriesCache()
      setNewName("")
      setNewImage("")
      resetNewImageSelection()
      await load()
    } catch (err) {
      setCreateError(err.message)
    } finally {
      setCreating(false)
    }
  }

  if (loading) {
    return (
      <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
          <Typography sx={adminPageTitleSx}>Categories</Typography>
          <Typography sx={{ ...adminBodySx, maxWidth: 760 }}>
            Create new categories, edit their ordering and imagery, and manage the variant groups
            attached to each one inline.
          </Typography>
        </Box>
        <CategoryFormSkeleton />
        <CategoryRowSkeleton expanded />
        <CategoryRowSkeleton />
        <CategoryRowSkeleton />
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

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Typography sx={adminPageTitleSx}>Categories</Typography>
        <Typography sx={{ ...adminBodySx, maxWidth: 760 }}>
          Create new categories, edit their ordering and imagery, and manage the variant groups
          attached to each one inline.
        </Typography>
      </Box>

      <Box sx={{ ...adminCardSx, display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
          <Typography sx={adminSectionLabelSx}>New category</Typography>
          <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
            Add a category
          </Typography>
        </Box>

        <ErrorNotice>{createError}</ErrorNotice>

        <Box
          sx={{
            display: "grid",
            gap: 1,
            gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr)" },
          }}
        >
          <Box
            component="input"
            placeholder="Name *"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate()
            }}
            sx={adminInputSx}
          />
        </Box>

        <UploadArea
          hasFile={!!newImageFile || !!newImagePreview}
          preview={newImagePreview}
          label={newImageFile ? newImageFile.name : newImagePreview ? "Click to replace image" : "Click to choose image..."}
          inputRef={createFileInputRef}
          onChange={handleNewFileChange}
          alt="New category preview"
          onClear={newImageFile ? resetNewImageSelection : null}
        />
        <Typography sx={{ ...adminHintSx, fontStyle: "italic", textAlign: "center" }}>
          Images look best with a transparent background.
        </Typography>

        <Button type="button" onClick={handleCreate} disabled={creating} sx={{ ...adminPrimaryButtonSx, alignSelf: "flex-start" }}>
          {creating ? "Creating..." : "Create category"}
        </Button>
      </Box>

      {categories.map((category) => (
        <Box
          key={category._id}
          sx={{
            ...adminCardSx,
            ...(category.isActive ? null : hiddenEntityCardSx),
            p: 2,
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, flexWrap: "wrap" }}>
            {category.image ? (
              <Box
                component="img"
                src={category.image}
                alt={category.name}
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "10px",
                  objectFit: "cover",
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  flexShrink: 0,
                }}
              />
            ) : (
              <Box
                sx={{
                  width: 44,
                  height: 44,
                  borderRadius: "10px",
                  backgroundColor: adminPalette.pageBg,
                  border: "0.5px solid rgba(0,0,0,0.10)",
                  color: adminPalette.textTertiary,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <ImageOutlinedIcon sx={{ fontSize: 18 }} />
              </Box>
            )}

            <Box sx={{ flex: 1, minWidth: 220 }}>
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap", mb: 0.35 }}>
                <Typography sx={{ fontSize: 15, fontWeight: 500, color: adminPalette.textPrimary }}>
                  {category.name}
                </Typography>
                <StatusBadge>{category.isActive ? "Active" : "Inactive"}</StatusBadge>
              </Box>
              <Typography sx={{ fontSize: 11, color: adminPalette.textTertiary }}>
                order: {category.order} · slug: {category.slug}
              </Typography>
            </Box>

            <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
              <VisibilityToggleButton
                visible={category.isActive !== false}
                onClick={async () => {
                  await updateCategory(category._id, { isActive: category.isActive === false }).catch(() => null)
                  invalidateCategoriesCache()
                  load()
                }}
                label={category.isActive ? "Hide category from customers" : "Show category to customers"}
              />
              <Button
                type="button"
                onClick={() => setExpandedId((prev) => (prev === category._id ? null : category._id))}
                disabled={category.isActive === false}
                sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx }}
              >
                {expandedId === category._id ? "Collapse" : "Manage"}
              </Button>
            </Box>
          </Box>

          {expandedId === category._id && <CategoryDetail category={category} onRefresh={load} />}
        </Box>
      ))}

      {categories.length === 0 && (
        <Box sx={adminCardSx}>
          <Typography sx={adminBodySx}>No categories yet. Create one above.</Typography>
        </Box>
      )}
    </Box>
  )
}
