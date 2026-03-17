import { Link, useNavigate } from 'react-router-dom'
import { Box, Button, Container, Stack, Typography } from '@mui/material'
import { useTheme } from '@mui/material/styles'
import LocalGroceryStoreOutlinedIcon from '@mui/icons-material/LocalGroceryStoreOutlined'
import { useCart } from '../state/useCart'
import CartSummary from '../components/CartSummary'
import CartItemsSkeleton from '../components/CartItemsSkeleton'

export default function Cart() {
  const theme = useTheme()
  const { brand } = theme
  const navigate = useNavigate()
  const { state } = useCart()
  const { items: cartItems, loading } = state
  const showCartSummary = loading || cartItems.length > 0

  return (
    <Container
      maxWidth={false}
      sx={{
        pt: { xs: 1, md: 2 },
        pb: { xs: 2, md: 3.5 },
        maxWidth: '1200px',
        '& .MuiTypography-root': { fontFamily: brand.fontBase },
        '& .MuiButton-root': { fontFamily: brand.fontBase },
      }}
    >
      <Typography
        variant="h5"
        sx={{
          fontFamily: brand.fontDisplay,
          fontSize: { xs: '1.25rem', sm: '1.5rem' },
          fontWeight: 900,
          color: brand.primary,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          textAlign: 'center',
          mb: { xs: 2.5, md: 3 },
        }}
      >
        Your Cart
      </Typography>

      {!showCartSummary ? (
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
              '&:visited': { color: '#fff', backgroundColor: brand.primaryDark },
              '&:hover': { backgroundColor: '#143d22' },
            }}
          >
            Browse Menu
          </Button>
        </Stack>
      ) : (
        <Box sx={{ width: '100%', maxWidth: { xs: 420, sm: 680, md: 860 }, mx: 'auto' }}>
          <CartSummary
            items={cartItems}
            mode="cartSummary"
            title="Review Order"
            itemsContent={loading ? <CartItemsSkeleton /> : null}
            action={
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  fullWidth
                  component={Link}
                  to="/menu"
                  variant="outlined"
                  sx={{
                    py: 1.35,
                    borderRadius: '10px',
                    fontWeight: 700,
                    textTransform: 'none',
                    color: brand.primaryDark,
                    borderColor: '#d6e4dd',
                    backgroundColor: '#fff',
                    '&:visited': {
                      color: brand.primaryDark,
                      borderColor: '#d6e4dd',
                    },
                    '&:hover': { borderColor: '#b7cec2', backgroundColor: '#f8fcfa' },
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
                    borderRadius: '10px',
                    fontWeight: 700,
                    textTransform: 'none',
                    fontSize: '1rem',
                    fontFamily: "'Montserrat', sans-serif",
                    bgcolor: '#1e5631',
                    '&:hover': { bgcolor: '#143d22' },
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
