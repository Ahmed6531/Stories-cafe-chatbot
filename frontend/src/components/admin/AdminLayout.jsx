import { NavLink, Outlet } from "react-router-dom"
import { styled } from '@mui/material/styles'
import Box from '@mui/material/Box'

const Shell = styled(Box)(() => ({
  display: 'flex',
  minHeight: '100vh',
  background: '#fff',
}))

const Sidebar = styled('aside')(({ theme }) => ({
  width: 220,
  flexShrink: 0,
  height: '100vh',
  position: 'sticky',
  top: 0,
  overflowY: 'auto',
  borderRight: `1px solid ${theme.brand.borderLight}`,
  padding: '20px 14px',
  display: 'flex',
  flexDirection: 'column',
  gap: 4,
  background: '#fff',
}))

const SideTitle = styled(Box)(({ theme }) => ({
  padding: '4px 10px 12px',
  fontWeight: 700,
  fontFamily: theme.brand.fontBase,
  fontSize: 15,
  color: theme.brand.textPrimary,
  borderBottom: `1px solid ${theme.brand.borderLight}`,
  marginBottom: 8,
}))

const SideLink = styled(NavLink)(({ theme }) => ({
  display: 'block',
  padding: '10px 12px',
  borderRadius: 12,
  fontWeight: 600,
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  color: theme.brand.textPrimary,
  textDecoration: 'none',
  transition: 'background 0.2s, color 0.2s',
  '&:hover': {
    background: 'rgba(0, 112, 74, 0.06)',
    color: theme.brand.primary,
  },
  '&.active': {
    background: 'rgba(0, 112, 74, 0.10)',
    color: theme.brand.primary,
  },
}))

const Main = styled('main')(() => ({
  display: 'flex',
  flexDirection: 'column',
  flex: 1,
  minWidth: 0,
  height: '100vh',
  overflow: 'hidden',
}))

const Topbar = styled('header')(({ theme }) => ({
  height: 52,
  padding: '0 24px',
  display: 'flex',
  alignItems: 'center',
  borderBottom: `1px solid ${theme.brand.borderLight}`,
  background: '#fff',
  flexShrink: 0,
  fontWeight: 700,
  fontFamily: theme.brand.fontBase,
  fontSize: 15,
  color: theme.brand.textPrimary,
}))

const Page = styled(Box)(() => ({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: 'clamp(16px, 4vw, 40px)',
}))

export default function AdminLayout() {
  return (
    <Shell>
      <Sidebar>
        <SideTitle>Admin Panel</SideTitle>
        <SideLink to="/admin" end>Dashboard</SideLink>
        <SideLink to="/admin/items">Menu Items</SideLink>
        <SideLink to="/admin/variant-groups">Variant Groups</SideLink>
        <SideLink to="/admin/categories">Categories</SideLink>
      </Sidebar>
      <Main>
        <Topbar>Stories Café — Admin</Topbar>
        <Page>
          <Outlet />
        </Page>
      </Main>
    </Shell>
  )
}
