import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Container, Stack, Typography } from '@mui/material'
import LocalGroceryStoreOutlinedIcon from '@mui/icons-material/LocalGroceryStoreOutlined'
import { useCart } from '../state/useCart'
import CartSummary from '../components/CartSummary'

const brand = {
  primary: '#00704a',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

export default function Cart() {
  const navigate = useNavigate()
  const { state } = useCart()
  const { items: cartItems, loading } = state

  if (loading) {
    return (
      <Container sx={{ py: 3, textAlign: 'center' }}>
        <Typography sx={{ fontFamily: brand.fontBase }}>Loading your cart...</Typography>
      </Container>
    )
  }

  return (
    <Container
      maxWidth={false}
      sx={{
        py: { xs: 2, md: 4 },
        maxWidth: '1200px',
        '& .MuiTypography-root': { fontFamily: brand.fontBase },
        '& .MuiButton-root': { fontFamily: brand.fontBase },
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontFamily: brand.fontDisplay,
          fontWeight: 900,
          color: brand.primary,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textAlign: 'center',
          mb: 3,
        }}
      >
        Your Cart
      </Typography>

      {cartItems.length === 0 ? (
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 8 }}>
          <LocalGroceryStoreOutlinedIcon sx={{ fontSize: 50, color: brand.primary, opacity: 0.3 }} />
          <Typography variant="h6" fontWeight={800} sx={{ color: brand.textPrimary }}>
            Your cart is empty
          </Typography>
          <Typography variant="body2" sx={{ color: brand.textSecondary, maxWidth: 360, mb: 2 }}>
            Looks like you haven't added anything yet. Explore our menu to find your favorites.
          </Typography>
          <Button
            component={Link}
            to="/menu"
            variant="contained"
            sx={{
              borderRadius: '10px',
              px: 5,
              py: 1.5,
              fontWeight: 700,
              textTransform: 'none',
              backgroundColor: brand.primaryDark,
              '&:hover': { backgroundColor: '#143d22' },
            }}
          >
            Browse Menu
          </Button>
        </Stack>
      ) : (
        <Box sx={{ maxWidth: 650, mx: 'auto' }}>
          <CartSummary
            items={cartItems}
            mode="cartSummary"
            title="Review Order"
            action={
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  fullWidth
                  component={Link}
                  to="/menu"
                  variant="outlined"
                  sx={{
                    py: 1.5,
                    borderRadius: '12px',
                    fontWeight: 700,
                    textTransform: 'none',
                    color: brand.primaryDark,
                    borderColor: '#cfe0d6',
                    '&:hover': { borderColor: brand.primary, backgroundColor: 'rgba(0,112,74,0.04)' },
                  }}
                >
                  Add More
                </Button>

                <Button
                  fullWidth
                  variant="contained"
                  onClick={() => navigate('/checkout')}
                  sx={{
                    py: 1.5,
                    borderRadius: '12px',
                    fontWeight: 700,
                    textTransform: 'none',
                    backgroundColor: brand.primaryDark,
                    '&:hover': { backgroundColor: '#143d22' },
                  }}
                >
                  Checkout
                </Button>
              </Stack>
            }
          />
        </Box>
      )}
    </Container>
  )
}
