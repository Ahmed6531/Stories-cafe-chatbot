import { Link, useNavigate } from 'react-router-dom'
import {
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  IconButton,
  Stack,
  Typography,
} from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import LocalGroceryStoreOutlinedIcon from '@mui/icons-material/LocalGroceryStoreOutlined'
import { useCart } from '../state/useCart'

const brand = {
  primary: '#00704a',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

const placeholderImg = 'https://via.placeholder.com/100/8B7355/FFFFFF?text=Coffee'

const formatLL = (value) => `L.L ${Number(value || 0).toLocaleString()}`

export default function Cart() {
  const navigate = useNavigate()
  const { state, updateQty, removeFromCart } = useCart()
  const { items: cartItems, loading } = state

  const subtotal = cartItems.reduce((total, item) => total + (item.price || 0) * item.qty, 0)
  const estimatedTax = Math.round(subtotal * 0.08)
  const total = subtotal + estimatedTax

  if (loading) {
    return (
      <Container sx={{ py: 3, '& .MuiTypography-root': { fontFamily: brand.fontBase } }}>
        <Typography>Loading your cart...</Typography>
      </Container>
    )
  }

  return (
    <Container
      maxWidth="xl"
      sx={{
        py: 3,
        '& .MuiTypography-root': { fontFamily: brand.fontBase },
        '& .MuiButton-root': { fontFamily: brand.fontBase },
      }}
    >
      <Typography
        variant="h5"
        fontWeight={900}
        sx={{
          fontFamily: brand.fontDisplay,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          color: brand.primary,
          textAlign: 'center',
          mb: 3,
        }}
      >
        Your Cart
      </Typography>

      {cartItems.length === 0 ? (
        <Stack spacing={2} alignItems="center" textAlign="center" sx={{ py: 6 }}>
          <LocalGroceryStoreOutlinedIcon sx={{ fontSize: 30, color: brand.primary, opacity: 0.9 }} />
          <Typography variant="h6" fontWeight={800} sx={{ color: brand.textPrimary }}>
            Your cart is empty
          </Typography>
          <Typography variant="body2" sx={{ color: brand.textSecondary, maxWidth: 360 }}>
            Start with a drink or pastry, and we will keep everything here until checkout.
          </Typography>
          <Button
            component={Link}
            to="/menu"
            variant="contained"
            sx={{
              mt: 1,
              borderRadius: '8px',
              px: 4,
              py: 1.2,
              fontWeight: 600,
              fontSize: '1rem',
              fontFamily: "'Montserrat', sans-serif",
              letterSpacing: '0.5px',
              textTransform: 'none',
              backgroundColor: brand.primaryDark,
              '&:hover': { backgroundColor: brand.primaryDark, transform: 'translateY(-2px)' },
              '&:visited': { color: '#fff' },
              transition: 'all 0.3s ease',
            }}
          >
            Browse Menu
          </Button>
        </Stack>
      ) : (
        <Stack direction={{ xs: 'column', lg: 'row' }} spacing={2.5} alignItems="flex-start">
          <Card
            variant="outlined"
            sx={{ flex: 1, width: '100%', borderRadius: 2, borderColor: '#dce8e1', overflow: 'hidden' }}
          >
            <CardContent sx={{ p: { xs: 1.5, sm: 2 }, '&:last-child': { pb: { xs: 1.5, sm: 2 } } }}>
              <Stack spacing={1.5}>
                {cartItems.map((item, index) => (
                  <Box key={item.lineId}>
                    <Stack
                      direction={{ xs: 'column', sm: 'row' }}
                      spacing={1.5}
                      alignItems={{ xs: 'stretch', sm: 'center' }}
                      sx={{
                        p: { xs: 1.25, sm: 1.5 },
                        border: '1px solid #e8efeb',
                        borderRadius: 2,
                        bgcolor: '#fff',
                      }}
                    >
                      <Box
                        sx={{
                          width: { xs: '100%', sm: 92 },
                          height: { xs: 140, sm: 92 },
                          borderRadius: 1.5,
                          overflow: 'hidden',
                          flexShrink: 0,
                          bgcolor: '#f0ede8',
                        }}
                      >
                        <Box
                          component="img"
                          src={item.image || placeholderImg}
                          alt={item.name}
                          onError={(e) => {
                            e.currentTarget.src = placeholderImg
                          }}
                          sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography variant="subtitle1" fontWeight={800} sx={{ color: brand.textPrimary }}>
                          {item.name}
                        </Typography>
                        {(() => {
                          if (Array.isArray(item.variants) && item.variants.length > 0) {
                            return (
                              <Typography variant="caption" sx={{ color: brand.primary }}>
                                {item.variants.join(', ')}
                              </Typography>
                            )
                          }
                          if (item.options && typeof item.options === 'object') {
                            const vals = Object.values(item.options).filter(Boolean)
                            if (vals.length > 0) {
                              return (
                                <Typography variant="caption" sx={{ color: brand.primary }}>
                                  {vals.join(', ')}
                                </Typography>
                              )
                            }
                          }
                          return null
                        })()}
                        <Typography variant="body2" sx={{ color: brand.textSecondary, mt: 0.4, fontWeight: 700 }}>
                          {formatLL((item.price || 0) * item.qty)}
                        </Typography>
                      </Box>

                      <Stack direction="row" spacing={1} alignItems="center" justifyContent="space-between">
                        <Stack
                          direction="row"
                          alignItems="center"
                          sx={{
                            border: '1px solid #e7e7e7',
                            borderRadius: 999,
                            px: 0.5,
                            py: 0.2,
                            bgcolor: '#fafafa',
                          }}
                        >
                          <IconButton
                            size="small"
                            onClick={() => updateQty(item.lineId, item.qty - 1)}
                            disabled={item.qty <= 1}
                            aria-label="Decrease quantity"
                            sx={{
                              color: brand.primary,
                              '&:hover': { bgcolor: '#f1f1f1' },
                            }}
                          >
                            <RemoveIcon fontSize="small" />
                          </IconButton>
                          <Typography sx={{ minWidth: 26, textAlign: 'center', fontWeight: 700 }}>
                            {item.qty}
                          </Typography>
                          <IconButton
                            size="small"
                            onClick={() => updateQty(item.lineId, item.qty + 1)}
                            aria-label="Increase quantity"
                            sx={{
                              color: brand.primary,
                              '&:hover': { bgcolor: '#f1f1f1' },
                            }}
                          >
                            <AddIcon fontSize="small" />
                          </IconButton>
                        </Stack>

                        <IconButton
                          onClick={() => removeFromCart(item.lineId)}
                          aria-label="Remove item"
                          sx={{
                            color: '#c62828',
                            border: '1px solid #e7e7e7',
                            bgcolor: '#fafafa',
                            '&:hover': { color: '#b42318', bgcolor: '#f1f1f1' },
                          }}
                        >
                          <DeleteOutlineIcon />
                        </IconButton>
                      </Stack>

                    </Stack>
                    {index < cartItems.length - 1 && <Divider sx={{ my: 1.2, opacity: 0.45 }} />}
                  </Box>
                ))}
              </Stack>
            </CardContent>
          </Card>

          <Card
            variant="outlined"
            sx={{
              width: '100%',
              maxWidth: { lg: 360 },
              borderRadius: 2,
              borderColor: '#dce8e1',
              position: { lg: 'sticky' },
              top: { lg: 84 },
            }}
          >
            <CardContent>
              <Typography variant="h6" fontWeight={800} sx={{ color: brand.textPrimary, mb: 1.5 }}>
                Order Summary
              </Typography>

              <Stack spacing={1.1}>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: brand.textSecondary }}>
                    Subtotal
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatLL(subtotal)}
                  </Typography>
                </Stack>
                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="body2" sx={{ color: brand.textSecondary }}>
                    Tax (estimated)
                  </Typography>
                  <Typography variant="body2" fontWeight={700}>
                    {formatLL(estimatedTax)}
                  </Typography>
                </Stack>

                <Divider sx={{ my: 0.4 }} />

                <Stack direction="row" justifyContent="space-between">
                  <Typography variant="subtitle1" fontWeight={800}>
                    Total
                  </Typography>
                  <Typography variant="subtitle1" fontWeight={900} sx={{ color: brand.primaryDark }}>
                    {formatLL(total)}
                  </Typography>
                </Stack>
              </Stack>

              <Button
                fullWidth
                variant="contained"
                onClick={() => navigate('/checkout')}
                sx={{
                  mt: 2,
                  borderRadius: '8px',
                  py: 1.2,
                  fontWeight: 600,
                  fontSize: '1rem',
                  fontFamily: "'Montserrat', sans-serif",
                  letterSpacing: '0.5px',
                  textTransform: 'none',
                  backgroundColor: brand.primaryDark,
                  '&:hover': { backgroundColor: brand.primaryDark, transform: 'translateY(-2px)' },
                  transition: 'all 0.3s ease',
                }}
              >
                Proceed to Checkout
              </Button>

              <Button
                fullWidth
                component={Link}
                to="/menu"
                variant="outlined"
                sx={{
                  mt: 1.1,
                  borderRadius: '8px',
                  py: 1.2,
                  fontWeight: 600,
                  fontSize: '1rem',
                  fontFamily: "'Montserrat', sans-serif",
                  letterSpacing: '0.5px',
                  textTransform: 'none',
                  borderColor: '#c7ddd1',
                  color: brand.primaryDark,
                  '&:visited': { color: brand.primaryDark, borderColor: '#c7ddd1' },
                  '&:hover': { borderColor: brand.primary, backgroundColor: 'rgba(0,112,74,0.06)' },
                }}
              >
                Continue Shopping
              </Button>
            </CardContent>
          </Card>
        </Stack>
      )}
    </Container>
  )
}
