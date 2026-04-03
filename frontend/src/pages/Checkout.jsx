import { useState, useEffect } from 'react'
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
  useTheme,
} from '@mui/material'
import { useCart } from '../state/useCart'
import { submitOrder } from '../API/ordersApi'
import { lockDeadCart } from '../API/http'
import CartSummary from '../components/CartSummary'

const formGroupSx = {
  marginBottom: '18px',
}

const checkoutWidths = {
  content: { xs: 420, sm: 760, md: 1200 },
  receipt: { xs: 420, sm: 560, md: 360 },
}

const centeredWidth = (maxWidth) => ({
  width: '100%',
  maxWidth,
  mx: 'auto',
})

export default function Checkout() {
  const theme = useTheme()
  const navigate = useNavigate()
  const { state, resetCart } = useCart()
  const { items, loading } = state
  const [orderTypeError, setOrderTypeError] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.brand.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    fontFamily: theme.brand.fontBase,
    boxSizing: 'border-box',
    backgroundColor: theme.palette.common.white,
    outline: 'none',
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '4px',
    fontWeight: 700,
    fontSize: '12px',
    color: theme.brand.textLabel,
    textTransform: 'uppercase',
    letterSpacing: '0.02em',
  }

  const orderOptionStyle = {
    m: 0,
    minHeight: 36,
    px: 0,
    py: 0.15,
    alignItems: 'center',
    '.MuiFormControlLabel-label': {
      fontWeight: 500,
      color: theme.brand.textOption,
      fontSize: '13px',
      fontFamily: theme.brand.fontBase,
    },
  }

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    orderType: '',
    notes: '',
  })

  useEffect(() => {
    if (!submitted && !loading && !items.length) navigate('/cart')
  }, [items, loading, submitted, navigate])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
    if (name === 'orderType' && value) {
      setOrderTypeError(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.orderType) {
      setOrderTypeError(true)
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
        menuItemId: Number(item.menuItemId ?? item.id),
        qty: item.qty,
        selectedOptions: Array.isArray(item.selectedOptions) ? item.selectedOptions : [],
        instructions: item.instructions || '',
      })),
      cartId: localStorage.getItem('cartId'),
    }

    try {
      const response = await submitOrder(payload)
      if (response.data.orderNumber) {
        setSubmitted(true)
        lockDeadCart(localStorage.getItem('cartId'))
        localStorage.removeItem('cartId')
        localStorage.removeItem('chatSessionId')
        localStorage.removeItem('chatMessages')
        localStorage.removeItem('chatMessagesSavedAt')
        resetCart()
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
        fontFamily: theme.brand.fontBase,
        '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
        '& .MuiButton-root': { fontFamily: theme.brand.fontBase },
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontFamily: theme.brand.fontDisplay,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 900,
          color: theme.brand.primary,
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
            ...centeredWidth(checkoutWidths.content),
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
          <Box sx={formGroupSx}>
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

          <Box sx={formGroupSx}>
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

          <Box sx={formGroupSx}>
            <label style={labelStyle}>Order Type *</label>
            <FormControl component="fieldset" fullWidth error={orderTypeError}>
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
                        color: theme.brand.radioInactive,
                        p: 0.5,
                        mr: 0.75,
                        '&.Mui-checked': { color: theme.brand.primary },
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
                        color: theme.brand.radioInactive,
                        p: 0.5,
                        mr: 0.75,
                        '&.Mui-checked': { color: theme.brand.primary },
                      }}
                    />
                  }
                  label="Dine In"
                  sx={orderOptionStyle}
                />
              </RadioGroup>
              {orderTypeError && (
                <Typography
                  variant="caption"
                  sx={{
                    mt: 0.5,
                    color: theme.brand.error,
                    fontSize: '0.75rem',
                    fontFamily: theme.brand.fontBase,
                  }}
                >
                  Required
                </Typography>
              )}
            </FormControl>
          </Box>

          <Box sx={formGroupSx}>
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

          <Box sx={{ mt: { xs: 1, md: 0.25 } }}>
            <Button
              component="button"
              type="button"
              onClick={() => navigate('/cart')}
              variant="text"
              sx={{
                px: 0,
                minWidth: 0,
                color: theme.brand.textMuted,
                fontWeight: 600,
                textTransform: 'none',
                fontSize: '0.95rem',
                '&:hover': { backgroundColor: 'transparent', color: theme.brand.primaryDark },
              }}
            >
              Back to Cart
            </Button>
          </Box>
        </Box>

        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100%',
            py: { xs: 0, md: 2 },
            mt: { xs: 0.75, md: 0 },
          }}
        >
          <CartSummary
            items={items}
            mode="receipt"
            sx={centeredWidth(checkoutWidths.receipt)}
          />

          <Stack direction="column" spacing={1.25} sx={{ pt: 1.5, ...centeredWidth(checkoutWidths.receipt) }}>
            <Button
              type="submit"
              form="checkout-form"
              fullWidth
              variant="contained"
              sx={{
                py: 1.5,
                borderRadius: '10px',
                bgcolor: theme.brand.primaryDark,
                fontWeight: 700,
                textTransform: 'none',
                fontSize: '1rem',
                fontFamily: theme.brand.fontBase,
                '&:hover': { bgcolor: theme.brand.primaryDeepHover },
              }}
            >
              Place Order
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  )
}
