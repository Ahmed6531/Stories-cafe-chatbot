import { Link, useNavigate } from "react-router-dom"
import { styled } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import { useSession } from '../../hooks/useSession'

const PageWrap = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 24,
  maxWidth: 700,
}))

const CardGrid = styled(Box)(() => ({
  display: 'grid',
  gap: 16,
  gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
}))

const NavCard = styled(Link)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
  padding: '20px 24px',
  borderRadius: 14,
  border: `1.5px solid ${theme.brand.border}`,
  background: '#fff',
  color: theme.brand.primary,
  fontFamily: theme.brand.fontBase,
  fontWeight: 700,
  fontSize: 15,
  textDecoration: 'none',
  minHeight: 110,
  justifyContent: 'center',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  '&:hover': {
    borderColor: theme.brand.primary,
    background: 'rgba(0, 112, 74, 0.04)',
    boxShadow: '0 2px 8px rgba(0,112,74,0.1)',
    color: theme.brand.primaryHover,
  },
}))

const CardSubtext = styled(Typography)(({ theme }) => ({
  fontSize: 13,
  fontWeight: 400,
  color: theme.palette.text.secondary,
  fontFamily: theme.brand.fontBase,
}))

export default function AdminDashboard() {
  const navigate = useNavigate()
  const { logout } = useSession()

  const handleLogout = async () => {
    await logout()
    navigate("/admin/login")
  }

  return (
    <PageWrap>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 1.5 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
            Admin Dashboard
          </Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            Manage menu items, upload images, manage categories, and track customer orders.
          </Typography>
        </Box>
        <Button variant="outlined" color="error" size="small" onClick={handleLogout}>
          Logout
        </Button>
      </Box>

      <CardGrid>
        <NavCard to="/admin/items">
          Manage Menu Items →
          <CardSubtext>Add, update, and organize products shown to customers.</CardSubtext>
        </NavCard>
        <NavCard to="/admin/categories">
          Manage Categories →
          <CardSubtext>Create and edit the categories that group your menu.</CardSubtext>
        </NavCard>
        <NavCard to="/admin/orders">
          Order History →
          <CardSubtext>Track all customer orders and monitor their status.</CardSubtext>
        </NavCard>
      </CardGrid>
    </PageWrap>
  )
}