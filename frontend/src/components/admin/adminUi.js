export const adminPalette = {
  pageBg: "#f8f9f8",
  surface: "#ffffff",
  surfaceSoft: "#f8f9f8",
  brandPrimary: "#00704a",
  brandPrimaryHover: "#147d56",
  brandPrimaryDark: "#1e5631",
  brandTint: "#eef7f2",
  brandTintStrong: "#e3f1ea",
  border: "rgba(0,0,0,0.10)",
  borderStrong: "rgba(0,0,0,0.15)",
  borderRow: "rgba(0,0,0,0.07)",
  textPrimary: "#111111",
  textSecondary: "#6b6b6b",
  textTertiary: "#9e9e9e",
  accent: "#111111",
  danger: "#c0392b",
  warningText: "#b45309",
  warningBg: "#fef3c7",
  infoText: "#1d4ed8",
  infoBg: "#dbeafe",
}

export const adminBorder = `0.5px solid ${adminPalette.border}`
export const adminBorderStrong = `0.5px solid ${adminPalette.borderStrong}`

export const adminPageTitleSx = {
  fontSize: 22,
  fontWeight: 600,
  color: adminPalette.textPrimary,
  lineHeight: 1.3,
}

export const adminSectionLabelSx = {
  fontSize: 11,
  fontWeight: 600,
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: adminPalette.brandPrimary,
  lineHeight: 1.4,
}

export const adminBodySx = {
  fontSize: 13,
  fontWeight: 400,
  color: adminPalette.textSecondary,
  lineHeight: 1.6,
}

export const adminLabelSx = {
  fontSize: 12,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  lineHeight: 1.4,
}

export const adminHintSx = {
  fontSize: 11,
  color: adminPalette.textTertiary,
  lineHeight: 1.4,
}

export const adminCardSx = {
  backgroundColor: adminPalette.surface,
  border: adminBorder,
  borderRadius: "12px",
  boxShadow: "none",
  p: { xs: 2, md: "16px 20px" },
}

export const adminInnerPanelSx = {
  backgroundColor: adminPalette.surfaceSoft,
  border: `0.5px solid rgba(0,0,0,0.08)`,
  borderRadius: "12px",
}

export const adminInputSx = {
  width: "100%",
  boxSizing: "border-box",
  border: adminBorderStrong,
  borderRadius: "8px",
  padding: "8px 10px",
  fontSize: 13,
  fontWeight: 400,
  lineHeight: 1.5,
  color: adminPalette.textPrimary,
  backgroundColor: adminPalette.pageBg,
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease",
  "&::placeholder": {
    color: "#c0c0c0",
    opacity: 1,
  },
  "&:focus": {
    outline: "none",
    borderColor: adminPalette.brandPrimary,
    boxShadow: "0 0 0 2px rgba(0,112,74,0.10)",
  },
  "&:disabled": {
    backgroundColor: adminPalette.pageBg,
    color: adminPalette.textTertiary,
    cursor: "not-allowed",
  },
}

export const adminSelectSx = {
  ...adminInputSx,
  appearance: "none",
  WebkitAppearance: "none",
  MozAppearance: "none",
  cursor: "pointer",
  paddingRight: "34px",
  backgroundImage:
    "linear-gradient(45deg, transparent 50%, #9e9e9e 50%), linear-gradient(135deg, #9e9e9e 50%, transparent 50%)",
  backgroundPosition: "calc(100% - 16px) calc(50% - 2px), calc(100% - 11px) calc(50% - 2px)",
  backgroundSize: "5px 5px, 5px 5px",
  backgroundRepeat: "no-repeat",
}

export const adminTextFieldSx = {
  "& .MuiInputLabel-root": {
    fontSize: 12,
    fontWeight: 500,
    color: adminPalette.textSecondary,
    transform: "translate(14px, 12px) scale(1)",
  },
  "& .MuiInputLabel-root.MuiInputLabel-shrink": {
    transform: "translate(14px, -8px) scale(0.92)",
    backgroundColor: adminPalette.pageBg,
    padding: "0 4px",
  },
  "& .MuiInputLabel-root.Mui-focused": {
    color: adminPalette.brandPrimary,
  },
  "& .MuiOutlinedInput-root": {
    borderRadius: "8px",
    backgroundColor: adminPalette.pageBg,
    fontSize: 13,
    color: adminPalette.textPrimary,
    "& fieldset": {
      border: adminBorderStrong,
    },
    "&:hover fieldset": {
      borderColor: adminPalette.borderStrong,
    },
    "&.Mui-focused fieldset": {
      borderColor: adminPalette.brandPrimary,
      boxShadow: "0 0 0 2px rgba(0,112,74,0.10)",
    },
  },
  "& .MuiInputBase-input": {
    padding: "10px 12px",
    fontSize: 13,
    color: adminPalette.textPrimary,
    "&::placeholder": {
      color: "#c0c0c0",
      opacity: 1,
    },
  },
  "& .MuiInputAdornment-root": {
    color: adminPalette.textTertiary,
  },
}

export const adminPrimaryButtonSx = {
  minWidth: 0,
  borderRadius: "8px",
  padding: "8px 16px",
  backgroundColor: adminPalette.brandPrimary,
  color: "#ffffff",
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.4,
  textTransform: "none",
  boxShadow: "none",
  "&:hover": {
    backgroundColor: adminPalette.brandPrimaryHover,
    boxShadow: "none",
  },
}

export const adminGhostButtonSx = {
  minWidth: 0,
  borderRadius: "8px",
  padding: "8px 16px",
  border: adminBorderStrong,
  backgroundColor: adminPalette.surface,
  color: adminPalette.textPrimary,
  fontSize: 13,
  fontWeight: 500,
  lineHeight: 1.4,
  textTransform: "none",
  boxShadow: "none",
  "&:hover": {
    backgroundColor: adminPalette.brandTint,
    borderColor: "rgba(0,112,74,0.18)",
    color: adminPalette.brandPrimary,
    boxShadow: "none",
  },
}

export const adminDangerGhostButtonSx = {
  ...adminGhostButtonSx,
  border: "0.5px solid #fca5a5",
  color: adminPalette.danger,
  "&:hover": {
    backgroundColor: "#fff7f7",
    borderColor: "#fca5a5",
  },
}

export const adminSmallButtonSx = {
  padding: "4px 10px",
  fontSize: 12,
}

export const adminTableWrapSx = {
  ...adminCardSx,
  overflowX: "auto",
  p: 0,
}

export const adminBadgeRequiredSx = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "6px",
  px: 1,
  py: "2px",
  fontSize: 11,
  fontWeight: 500,
  backgroundColor: adminPalette.warningBg,
  color: adminPalette.warningText,
}

export const adminBadgeOptionalSx = {
  display: "inline-flex",
  alignItems: "center",
  borderRadius: "6px",
  px: 1,
  py: "2px",
  fontSize: 11,
  fontWeight: 500,
  backgroundColor: adminPalette.brandTint,
  color: adminPalette.brandPrimaryDark,
}
