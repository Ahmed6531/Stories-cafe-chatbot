import { useState } from "react"
import { NavLink, Outlet, useNavigate } from "react-router-dom"
import Box from "@mui/material/Box"
import Button from "@mui/material/Button"
import Drawer from "@mui/material/Drawer"
import IconButton from "@mui/material/IconButton"
import MenuRoundedIcon from "@mui/icons-material/MenuRounded"
import { styled } from "@mui/material/styles"
import { useSession } from "../../hooks/useSession"
import {
  adminGhostButtonSx,
  adminPalette,
  adminSmallButtonSx,
} from "./adminUi"

function DashboardNavIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="4" y="4" width="6" height="6" rx="1.2" />
      <rect x="14" y="4" width="6" height="6" rx="1.2" />
      <rect x="4" y="14" width="6" height="6" rx="1.2" />
      <rect x="14" y="14" width="6" height="6" rx="1.2" />
    </svg>
  )
}

function ItemsSidebarIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" {...props}>
      <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <rect x="9" y="3" width="6" height="4" rx="1" />
      <line x1="9" y1="12" x2="15" y2="12" />
      <line x1="9" y1="16" x2="13" y2="16" />
    </svg>
  )
}

function CategoriesNavIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M12 7v5" />
      <path d="M12 12l-6 4" />
      <path d="M12 12l6 4" />
    </svg>
  )
}

function OrdersNavIcon(props) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
    </svg>
  )
}

const TOPBAR_HEIGHT = 52
const SIDEBAR_WIDTH = 232

const navItems = [
  { to: "/admin", label: "Dashboard", icon: DashboardNavIcon, end: true },
  { to: "/admin/items", label: "Items", icon: ItemsSidebarIcon },
  { to: "/admin/categories", label: "Categories", icon: CategoriesNavIcon },
  { to: "/admin/orders", label: "Orders", icon: OrdersNavIcon },
]

const SidebarLink = styled(NavLink)(() => ({
  position: "relative",
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "8px 10px",
  borderRadius: 8,
  color: "#666",
  fontSize: 13,
  fontWeight: 400,
  textDecoration: "none",
  transition: "background-color 0.15s ease, color 0.15s ease",
  "& .nav-icon": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 16,
    height: 16,
    fontSize: 16,
    opacity: 0.45,
    flexShrink: 0,
    transition: "opacity 0.15s ease",
  },
  "&:hover": {
    backgroundColor: "#f5f5f3",
    color: "#222",
    "& .nav-icon": { opacity: 0.85 },
  },
  "&.active": {
    backgroundColor: "#f0f0ec",
    color: "#111",
    fontWeight: 500,
    "& .nav-icon": { opacity: 0.85 },
  },
  "&.active::before": {
    content: '""',
    position: "absolute",
    left: -8,
    top: "50%",
    transform: "translateY(-50%)",
    width: 3,
    height: 18,
    background: "#111",
    borderRadius: "0 3px 3px 0",
  },
}))

function getInitials(user) {
  const source = user?.name || user?.fullName || user?.email || "Stories Cafe"
  const parts = String(source)
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)

  if (parts.length === 0) return "SC"
  return parts.map((part) => part[0]?.toUpperCase() || "").join("") || "SC"
}

function SidebarContent({ onNavigate }) {
  return (
    <Box component="nav" sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
      {navItems.map((item) => {
        const NavIcon = item.icon
        return (
          <SidebarLink key={item.to} to={item.to} end={item.end} onClick={onNavigate}>
            <Box className="nav-icon">
              <NavIcon fontSize="inherit" />
            </Box>
            <span>{item.label}</span>
          </SidebarLink>
        )
      })}
    </Box>
  )
}

export default function AdminShell() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { logout, user } = useSession()
  const navigate = useNavigate()

  async function handleLogout() {
    await logout()
    navigate("/admin/login")
  }

  const initials = getInitials(user)

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: adminPalette.pageBg,
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: `${SIDEBAR_WIDTH}px minmax(0, 1fr)` },
        gridTemplateRows: `${TOPBAR_HEIGHT}px minmax(0, 1fr)`,
      }}
    >
      <Box
        component="header"
        sx={{
          position: "sticky",
          top: 0,
          zIndex: 1201,
          gridColumn: "1 / -1",
          height: TOPBAR_HEIGHT,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          px: { xs: 1.5, sm: 2.5 },
          backgroundColor: adminPalette.surface,
          borderBottom: "0.5px solid rgba(0,0,0,0.09)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <IconButton
            onClick={() => setMobileOpen(true)}
            sx={{
              display: { xs: "inline-flex", md: "none" },
              color: adminPalette.textPrimary,
            }}
            aria-label="Open navigation"
          >
            <MenuRoundedIcon />
          </IconButton>
          <Box
            component="img"
            src="/stories-logo.png"
            alt="Stories"
            sx={{
              maxWidth: "112px",
              maxHeight: "26px",
              objectFit: "contain",
              flexShrink: 0,
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
        </Box>

        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <Box
            sx={{
              width: 32,
              height: 32,
              borderRadius: "999px",
              backgroundColor: "#f0f0ee",
              color: adminPalette.textPrimary,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.04em",
            }}
          >
            {initials}
          </Box>
          <Button
            onClick={handleLogout}
            sx={{ ...adminGhostButtonSx, ...adminSmallButtonSx, borderRadius: "18px", px: 2 }}
          >
            Logout
          </Button>
        </Box>
      </Box>

      <Box
        component="aside"
        sx={{
          display: { xs: "none", md: "block" },
          backgroundColor: "#fff",
          borderRight: "0.5px solid rgba(0,0,0,0.09)",
          padding: "10px 8px",
        }}
      >
        <SidebarContent />
      </Box>

      <Drawer
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        slotProps={{
          paper: {
            sx: {
              top: `${TOPBAR_HEIGHT}px`,
              height: `calc(100% - ${TOPBAR_HEIGHT}px)`,
              width: SIDEBAR_WIDTH,
              backgroundColor: "#fff",
              borderRight: "0.5px solid rgba(0,0,0,0.09)",
              padding: "10px 8px",
            },
          },
        }}
      >
        <SidebarContent onNavigate={() => setMobileOpen(false)} />
      </Drawer>

      <Box
        component="main"
        sx={{
          minWidth: 0,
          px: { xs: 2, sm: 3, md: 4 },
          py: { xs: 2.5, md: 3.5 },
          backgroundColor: adminPalette.pageBg,
        }}
      >
        <Outlet />
      </Box>
    </Box>
  )
}
