import { Container, Typography, Box, List, ListItem, ListItemText, Button, IconButton, Stack, Divider, Card, CardContent } from '@mui/material'
import { Add, Remove, Delete, ShoppingCartCheckout } from '@mui/icons-material'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../state/useCart'
import { formatLL } from '../data/variantCatalog'

export default function Cart() {
  const navigate = useNavigate()
  const { state, updateQty, removeFromCart, cartCount } = useCart()
  const { items, loading } = state

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0)

  if (loading) return <Container sx={{ py: 4 }}><Typography>Loading cart...</Typography></Container>

  if (cartCount === 0) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5" gutterBottom>Your cart is empty</Typography>
        <Button variant="contained" onClick={() => navigate('/menu')} sx={{ mt: 2 }}>Back to Menu</Button>
      </Container>
    )
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={900} gutterBottom>Your Cart</Typography>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
        <Box sx={{ flex: 2 }}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <List disablePadding>
              {items.map((item, idx) => (
                <Box key={item.lineId}>
                  <ListItem sx={{ py: 2 }}>
                    <ListItemText
                      primary={<Typography variant="h6" fontWeight={700}>{item.name}</Typography>}
                      secondary={
                        <Box>
                          <Typography variant="body2" color="text.secondary">
                            {item.selectedOptions?.join(', ')}
                          </Typography>
                          {item.instructions && (
                            <Typography variant="caption" sx={{ display: 'block', mt: 0.5, fontStyle: 'italic', color: 'text.secondary' }}>
                              Notes: {item.instructions}
                            </Typography>
                          )}
                          <Typography variant="subtitle1" fontWeight={700} color="primary" sx={{ mt: 1 }}>
                            {formatLL(item.price)}
                          </Typography>
                        </Box>
                      }
                    />
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton size="small" onClick={() => updateQty(item.lineId, item.qty - 1)} disabled={item.qty <= 1}>
                        <Remove fontSize="small" />
                      </IconButton>
                      <Typography fontWeight={700}>{item.qty}</Typography>
                      <IconButton size="small" onClick={() => updateQty(item.lineId, item.qty + 1)}>
                        <Add fontSize="small" />
                      </IconButton>
                      <IconButton color="error" onClick={() => removeFromCart(item.lineId)}>
                        <Delete />
                      </IconButton>
                    </Stack>
                  </ListItem>
                  {idx < items.length - 1 && <Divider />}
                </Box>
              ))}
            </List>
          </Card>
        </Box>

        <Box sx={{ flex: 1 }}>
          <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'grey.50' }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800} gutterBottom>Order Summary</Typography>
              <Stack spacing={2} sx={{ mt: 2 }}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography>Subtotal</Typography>
                  <Typography fontWeight={700}>{formatLL(subtotal)}</Typography>
                </Stack>
                <Divider />
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="h6" fontWeight={800}>Total</Typography>
                  <Typography variant="h6" fontWeight={800} color="primary">{formatLL(subtotal)}</Typography>
                </Stack>
                <Button
                  variant="contained"
                  fullWidth
                  size="large"
                  startIcon={<ShoppingCartCheckout />}
                  onClick={() => navigate('/checkout')}
                  sx={{ py: 1.5, borderRadius: 2, mt: 2 }}
                >
                  Checkout
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Box>
      </Stack>
    </Container>
  )
}
