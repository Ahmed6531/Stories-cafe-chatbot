import { useState } from 'react'
import { Container, Typography, Box, TextField, Button, Stack, Card, CardContent, RadioGroup, FormControlLabel, Radio, MenuItem as MuiMenuItem } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../state/useCart'
import http from '../API/http'
import { formatLL } from '../data/variantCatalog'

export default function Checkout() {
  const navigate = useNavigate()
  const { state, cartCount, clearCart } = useCart()
  const { items } = state

  const [form, setForm] = useState({
    name: '',
    phone: '',
    orderType: 'pickup',
    address: '',
    notes: ''
  })

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name || !form.phone) return alert('Name and phone are required')
    if (form.orderType === 'delivery' && !form.address) return alert('Address is required for delivery')

    const payload = {
      orderType: form.orderType,
      customer: {
        name: form.name,
        phone: form.phone,
        address: form.address
      },
      notesToBarista: form.notes,
      items: items.map(item => ({
        menuItemId: item.menuItemId,
        qty: item.qty,
        selectedOptions: item.selectedOptions,
        instructions: item.instructions
      })),
      cartId: localStorage.getItem('cartId')
    }

    try {
      const response = await http.post('/orders', payload)
      if (response.data.orderNumber) {
        // Clear local cart state (backend is cleared by orders controller)
        // refreshCart() or clearCart()
        localStorage.removeItem('cartId') // Remove cartId as requested: "order clears backend cart + removes localStorage.cartId"
        navigate('/success', { state: { orderNumber: response.data.orderNumber } })
      }
    } catch (err) {
      console.error(err)
      alert('Failed to place order: ' + (err.response?.data?.error || err.message))
    }
  }

  if (cartCount === 0) {
    return (
      <Container sx={{ py: 8, textAlign: 'center' }}>
        <Typography variant="h5">No items to checkout</Typography>
        <Button variant="contained" onClick={() => navigate('/menu')} sx={{ mt: 2 }}>Back to Menu</Button>
      </Container>
    )
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h4" fontWeight={900} gutterBottom>Checkout</Typography>

      <form onSubmit={handleSubmit}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4}>
          <Box sx={{ flex: 2 }}>
            <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>Customer Information</Typography>
                <Stack spacing={2} sx={{ mt: 2 }}>
                  <TextField
                    label="Full Name"
                    required
                    fullWidth
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                  />
                  <TextField
                    label="Phone Number"
                    required
                    fullWidth
                    value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })}
                  />
                </Stack>
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2, mb: 3 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>Order Type</Typography>
                <RadioGroup
                  value={form.orderType}
                  onChange={e => setForm({ ...form, orderType: e.target.value })}
                  sx={{ mt: 1 }}
                >
                  <FormControlLabel value="pickup" control={<Radio />} label="Pickup" />
                  <FormControlLabel value="dine_in" control={<Radio />} label="Dine In" />
                  <FormControlLabel value="delivery" control={<Radio />} label="Delivery" />
                </RadioGroup>

                {form.orderType === 'delivery' && (
                  <TextField
                    label="Delivery Address"
                    required
                    fullWidth
                    multiline
                    rows={2}
                    sx={{ mt: 2 }}
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                  />
                )}
              </CardContent>
            </Card>

            <Card variant="outlined" sx={{ borderRadius: 2 }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>Extra Notes</Typography>
                <TextField
                  label="Notes to Barista"
                  fullWidth
                  multiline
                  rows={2}
                  sx={{ mt: 1 }}
                  placeholder="e.g., extra hot, no sugar..."
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                />
              </CardContent>
            </Card>
          </Box>

          <Box sx={{ flex: 1 }}>
            <Card variant="outlined" sx={{ borderRadius: 2, bgcolor: 'primary.main', color: 'white' }}>
              <CardContent>
                <Typography variant="h6" fontWeight={800} gutterBottom>Order Summary</Typography>
                <Typography variant="body2" sx={{ opacity: 0.9 }}>{cartCount} items</Typography>
                <Stack spacing={1} sx={{ mt: 2 }}>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography variant="h5" fontWeight={900}>Total</Typography>
                    <Typography variant="h5" fontWeight={900}>{formatLL(subtotal)}</Typography>
                  </Stack>
                  <Button
                    type="submit"
                    variant="contained"
                    fullWidth
                    size="large"
                    sx={{
                      mt: 3,
                      bgcolor: 'white',
                      color: 'primary.main',
                      fontWeight: 800,
                      '&:hover': { bgcolor: 'grey.100' }
                    }}
                  >
                    Place Order
                  </Button>
                </Stack>
              </CardContent>
            </Card>
          </Box>
        </Stack>
      </form>
    </Container>
  )
}
