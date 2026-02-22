import { Container, Typography, Box, Button, Paper } from '@mui/material'
import { CheckCircleOutline } from '@mui/icons-material'
import { useNavigate, useLocation } from 'react-router-dom'

export default function Success() {
  const navigate = useNavigate()
  const location = useLocation()
  const { orderNumber } = location.state || { orderNumber: 'N/A' }

  return (
    <Container sx={{ py: 8, textAlign: 'center' }}>
      <Paper elevation={0} variant="outlined" sx={{ py: 8, px: 4, borderRadius: 4 }}>
        <CheckCircleOutline color="success" sx={{ fontSize: 100, mb: 4 }} />
        <Typography variant="h3" fontWeight={900} gutterBottom>Order Placed!</Typography>
        <Typography variant="h5" color="text.secondary" gutterBottom>
          Thank you for your order.
        </Typography>
        <Box sx={{ my: 4, py: 2, bgcolor: 'grey.100', borderRadius: 2 }}>
          <Typography variant="h6">Order Number</Typography>
          <Typography variant="h4" fontWeight={900} color="primary">#{orderNumber}</Typography>
        </Box>
        <Typography variant="body1" sx={{ mb: 4 }} color="text.secondary">
          We'll notify you when your order is ready.
        </Typography>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Button variant="contained" size="large" onClick={() => navigate('/menu')} sx={{ px: 6, py: 1.5, borderRadius: 2 }}>
            Back to Menu
          </Button>
          <Button variant="outlined" size="large" onClick={() => navigate('/')} sx={{ px: 6, py: 1.5, borderRadius: 2 }}>
            Back to Home
          </Button>
        </div>
      </Paper>
    </Container>
  )
}
