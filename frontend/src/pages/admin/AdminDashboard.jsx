import { Link } from "react-router-dom"
import { styled } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

const PageWrap = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 20,
  maxWidth: 600,
}))

const CardGrid = styled(Box)(() => ({
  display: 'grid',
  gap: 12,
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
}))

const NavCard = styled(Link)(({ theme }) => ({
  display: 'block',
  padding: '16px 20px',
  borderRadius: 14,
  border: `1.5px solid ${theme.brand.border}`,
  background: '#fff',
  color: theme.brand.primary,
  fontFamily: theme.brand.fontBase,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  '&:hover': {
    borderColor: theme.brand.primary,
    background: 'rgba(0, 112, 74, 0.04)',
    boxShadow: '0 2px 8px rgba(0,112,74,0.1)',
    color: theme.brand.primaryHover,
  },
}))

export default function AdminDashboard() {
  return (
    <PageWrap>
      <Box>
        <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
          Admin Dashboard
        </Typography>
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          Manage menu items, upload images, and manage categories.
        </Typography>
      </Box>

      <CardGrid>
        <NavCard to="/admin/items">Manage Menu Items →</NavCard>
        <NavCard to="/admin/categories">Manage Categories →</NavCard>
      </CardGrid>
    </PageWrap>
  )
}
