import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  FormControl,
  FormControlLabel,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/material'
import { useCart } from '../state/useCart'
import http from '../API/http'
import CartSummary from '../components/CartSummary'

const inputStyle = {
  width: '100%',
  padding: '10px 12px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: "'Montserrat', sans-serif",
  boxSizing: 'border-box',
  backgroundColor: '#fff',
  outline: 'none',
}

const labelStyle = {
  display: 'block',
  marginBottom: '4px',
  fontWeight: 700,
  fontSize: '12px',
  color: '#444',
  textTransform: 'uppercase',
  letterSpacing: '0.02em',
}

const formGroupStyle = {
  marginBottom: '18px',
}

const orderOptionStyle = {
  m: 0,
  minHeight: 36,
  px: 0,
  py: 0.15,
  alignItems: 'center',
  '.MuiFormControlLabel-label': {
    fontWeight: 500,
    color: '#4f4f4f',
    fontSize: '13px',
    fontFamily: "'Montserrat', sans-serif",
  },
}

export default function Checkout() {
  const navigate = useNavigate()
  const { state, clearCart } = useCart()
  const { items } = state

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    orderType: '',
    notes: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name || !formData.phone || !formData.orderType) {
      alert('Please fill in all required fields')
      return
    }

    const payload = {
      orderType: formData.orderType,
      customer: {
        name: formData.name,
        phone: formData.phone,
        address: '',
      },
      notesToBarista: formData.notes,
      items: items.map((item) => ({
        menuItemId: item.menuItemId || item.id,
        qty: item.qty,
        selectedOptions: item.selectedOptions || [],
        instructions: item.instructions || '',
      })),
      cartId: localStorage.getItem('cartId'),
    }

    try {
      const response = await http.post('/orders', payload)
      if (response.data.orderNumber) {
        localStorage.removeItem('cartId')
        await clearCart()
        navigate('/success', { state: { orderNumber: response.data.orderNumber } })
      }
    } catch (err) {
      console.error(err)
      alert('Failed to place order: ' + (err.response?.data?.error || err.message))
    }
  }

  return (
    <Box
      sx={{
        px: { xs: 2, md: 4 },
        pt: { xs: 1, md: 2 },
        pb: { xs: 2, md: 4 },
        maxWidth: '1200px',
        margin: '0 auto',
        fontFamily: "'Montserrat', sans-serif",
        '& .MuiTypography-root': { fontFamily: "'Montserrat', sans-serif" },
        '& .MuiButton-root': { fontFamily: "'Montserrat', sans-serif" },
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif",
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 900,
          color: '#00704a',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textAlign: 'center',
          mb: { xs: 2.5, md: 3 },
        }}
      >
        Checkout
      </Typography>

        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: { xs: '1fr', md: '1fr 360px' },
            gap: { xs: '24px', md: '32px' },
            alignItems: 'stretch',
          }}
        >
        <Box
          component="form"
          id="checkout-form"
          onSubmit={handleSubmit}
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
          }}
        >
          <Box style={formGroupStyle}>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={inputStyle}
              placeholder="Your name"
            />
          </Box>

          <Box style={formGroupStyle}>
            <label style={labelStyle}>Phone Number *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              style={inputStyle}
              placeholder="70 000 000"
            />
          </Box>

          <Box style={formGroupStyle}>
            <label style={labelStyle}>Order Type *</label>
            <FormControl component="fieldset" fullWidth>
              <RadioGroup
                name="orderType"
                value={formData.orderType}
                onChange={handleChange}
                row
                sx={{
                  gap: 3,
                  flexWrap: 'wrap',
                }}
              >
                <FormControlLabel
                  value="pickup"
                  control={
                    <Radio
                      size="small"
                      sx={{
                        color: '#9aa09d',
                        p: 0.5,
                        mr: 0.75,
                        '&.Mui-checked': { color: '#00704a' },
                      }}
                    />
                  }
                  label="Pickup"
                  sx={orderOptionStyle}
                />
                <FormControlLabel
                  value="dine_in"
                  control={
                    <Radio
                      size="small"
                      sx={{
                        color: '#9aa09d',
                        p: 0.5,
                        mr: 0.75,
                        '&.Mui-checked': { color: '#00704a' },
                      }}
                    />
                  }
                  label="Dine In"
                  sx={orderOptionStyle}
                />
              </RadioGroup>
            </FormControl>
          </Box>

          <Box style={formGroupStyle}>
            <label style={labelStyle}>Special Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              style={{
                ...inputStyle,
                resize: 'none',
                minHeight: '140px',
              }}
              placeholder="Any specific requests?"
            />
          </Box>

          <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 2 }}>
            <CartSummary
              items={items}
              mode="receipt"
              sx={{
                maxWidth: 360,
                mx: 'auto',
              }}
            />
          </Box>

          <Box sx={{ display: { xs: 'block', md: 'none' }, mt: 1.5 }}>
            <Button
              type="submit"
              form="checkout-form"
              fullWidth
              variant="contained"
              sx={{
                maxWidth: 360,
                width: '100%',
                mx: 'auto',
                display: 'flex',
                py: 1.5,
                borderRadius: '10px',
                bgcolor: '#1e5631',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '1rem',
                fontFamily: "'Montserrat', sans-serif",
                '&:hover': { bgcolor: '#143d22' },
              }}
            >
              Place Order
            </Button>
          </Box>

          <Box sx={{ mt: { xs: 1, md: 0.25 }, pt: 0 }}>
            <Button
              component="button"
              type="button"
              onClick={() => navigate('/cart')}
              variant="text"
              sx={{
                px: 0,
                minWidth: 0,
                color: '#6b7a73',
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.95rem',
                '&:hover': { backgroundColor: 'transparent', color: '#1e5631' },
              }}
            >
              Back to Cart
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            display: { xs: 'none', md: 'flex' },
            flexDirection: 'column',
            minHeight: '100%',
            pt: { xs: 0, md: 4 },
          }}
        >
          <CartSummary
            items={items}
            mode="receipt"
            sx={{
              maxWidth: 360,
              width: '100%',
              mx: 'auto',
            }}
          />

          <Stack
            direction={{ xs: 'column', md: 'column' }}
            spacing={1.25}
            sx={{ pt: 1.5, maxWidth: 360, width: '100%', mx: 'auto' }}
          >
            <Button
              type="submit"
              form="checkout-form"
              fullWidth
              variant="contained"
              sx={{
                py: 1.5,
                borderRadius: '10px',
                bgcolor: '#1e5631',
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '1rem',
                fontFamily: "'Montserrat', sans-serif",
                '&:hover': { bgcolor: '#143d22' },
              }}
            >
              Place Order
            </Button>

            <Button
              onClick={() => navigate('/cart')}
              variant="text"
              sx={{
                display: { xs: 'inline-flex', md: 'none' },
                color: '#5f6b64',
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.95rem',
                '&:hover': { backgroundColor: 'transparent', color: '#1e5631' },
              }}
            >
              Back to Cart
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
