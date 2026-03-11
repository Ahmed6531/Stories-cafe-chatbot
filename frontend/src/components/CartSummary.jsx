import { Box, Card, CardContent, Divider, IconButton, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { formatLL } from '../data/variantCatalog'
import { calculateOrderTotals } from '../utils/orderPricing'
import { useCart } from '../state/useCart'

const brand = {
  primary: '#00704a',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  fontBase: "'Montserrat', sans-serif",
  paper: '#fdfcfb',
  border: '#e0ddd5',
  borderSoft: '#ecefed',
}

const placeholderImg = 'https://via.placeholder.com/100/8B7355/FFFFFF?text=Coffee'

export default function CartSummary({
  items = [],
  mode = 'cartSummary',
  title = 'Order Summary',
  action,
  sx,
}) {
  const { updateQty, removeFromCart } = useCart()
  const { subtotal, tax, total } = calculateOrderTotals(items)
  
  const isReceipt = mode === 'receipt'
  const resolvedTitle = isReceipt ? 'Receipt' : title

  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        borderRadius: isReceipt ? '4px' : '16px', 
        borderColor: brand.border,
        bgcolor: brand.paper,
        boxShadow: 'none',
        ...sx,
      }}
    >
      <CardContent sx={{ p: isReceipt ? { xs: 2.5, md: 3.5 } : { xs: 2, sm: 3 } }}>
        <Typography
          variant="subtitle2"
          sx={{
            fontFamily: brand.fontBase,
            fontWeight: 800,
            textAlign: isReceipt ? 'center' : 'left',
            mb: 2.5,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: brand.textPrimary,
            fontSize: '0.75rem',
          }}
        >
          {resolvedTitle}
        </Typography>

        {items.length === 0 ? (
          <Typography variant="body2" sx={{ color: brand.textSecondary, py: 2, fontFamily: brand.fontBase }}>
            Your cart is empty.
          </Typography>
        ) : (
          <>
            {/* ITEM LISTING SECTION */}
            <Stack spacing={isReceipt ? 1.2 : 0}>
              {items.map((item, index) => {
                if (isReceipt) {
                  // --- RECEIPT MODE UI ---
                  return (
                    <Stack key={item.lineId || index} direction="row" justifyContent="space-between" alignItems="baseline">
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.85rem', color: brand.textPrimary, fontFamily: brand.fontBase }}
                      >
                        <Box component="span" sx={{ fontWeight: 700, mr: 0.5, opacity: 0.7 }}>
                          {item.qty}x
                        </Box>
                        {item.name}
                      </Typography>
                      <Typography
                        variant="body2"
                        sx={{ fontSize: '0.85rem', fontWeight: 600, fontFamily: brand.fontBase }}
                      >
                        {formatLL((item.price || 0) * item.qty)}
                      </Typography>
                    </Stack>
                  )
                }

                // --- CART MODE UI (Rich Layout) ---
                return (
                  <Box key={item.lineId || index}>
                    <Stack direction="row" alignItems="center" spacing={2} sx={{ py: 2 }}>
                      <Box sx={{ width: 64, height: 64, borderRadius: '12px', overflow: 'hidden', flexShrink: 0, bgcolor: '#f3efe9' }}>
                        <Box component="img" src={item.image || placeholderImg} sx={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      </Box>

                      <Box sx={{ flex: 1, minWidth: 0 }}>
                        <Typography
                          variant="body1"
                          sx={{
                            color: brand.textPrimary,
                            fontWeight: 800,
                            fontSize: '0.95rem',
                            lineHeight: 1.2,
                            fontFamily: brand.fontBase,
                          }}
                        >
                          {item.name}
                        </Typography>
                        <Typography
                          variant="body2"
                          sx={{ color: brand.textSecondary, fontWeight: 600, fontFamily: brand.fontBase }}
                        >
                          {formatLL(item.price || 0)}
                        </Typography>
                      </Box>

                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Stack direction="row" alignItems="center" sx={{ border: `1px solid ${brand.border}`, borderRadius: '999px', height: 32, px: 0.5, bgcolor: '#fff' }}>
                          <IconButton size="small" onClick={() => updateQty(item.lineId, item.qty - 1)} disabled={item.qty <= 1}>
                            <RemoveIcon sx={{ fontSize: '1.1rem' }} />
                          </IconButton>
                          <Typography
                            sx={{
                              minWidth: 20,
                              textAlign: 'center',
                              fontWeight: 700,
                              fontSize: '0.85rem',
                              fontFamily: brand.fontBase,
                            }}
                          >
                            {item.qty}
                          </Typography>
                          <IconButton size="small" onClick={() => updateQty(item.lineId, item.qty + 1)}>
                            <AddIcon sx={{ fontSize: '1.1rem' }} />
                          </IconButton>
                        </Stack>
                        <IconButton onClick={() => removeFromCart(item.lineId)} sx={{ color: '#cf2e2e' }} size="small">
                          <DeleteOutlineIcon fontSize="small" />
                        </IconButton>
                      </Stack>
                    </Stack>
                    {index < items.length - 1 && <Divider sx={{ borderColor: brand.borderSoft }} />}
                  </Box>
                )
              })}
            </Stack>

            <Divider
              sx={{
                borderStyle: isReceipt ? 'dashed' : 'solid',
                my: 2.5,
                borderColor: '#d1cdc2',
                opacity: isReceipt ? 1 : 0.5,
              }}
            />

            {/* TOTALS SECTION */}
            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" sx={{ color: brand.textSecondary, fontWeight: 700, fontFamily: brand.fontBase }}>
                  SUBTOTAL
                </Typography>
                <Typography variant="caption" sx={{ fontWeight: 700, fontFamily: brand.fontBase }}>
                  {formatLL(subtotal)}
                </Typography>
              </Stack>

              {isReceipt && (
                <>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ color: brand.textSecondary, fontFamily: brand.fontBase }}>
                      TAX (VAT)
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: brand.fontBase }}>
                      {formatLL(tax)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ borderStyle: 'dashed', mb: 2, borderColor: '#d1cdc2' }} />
                </>
              )}

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" fontWeight={800} sx={{ letterSpacing: '0.05em', fontFamily: brand.fontBase }}>
                  TOTAL
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={900}
                  sx={{ color: brand.primaryDark, fontSize: isReceipt ? '1.25rem' : '1.1rem', fontFamily: brand.fontBase }}
                >
                  {formatLL(total)}
                </Typography>
              </Stack>
            </Stack>
          </>
        )}

        {action && <Box sx={{ mt: 3 }}>{action}</Box>}

        {isReceipt && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              textAlign: 'center',
              mt: 4,
              opacity: 0.4,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              fontFamily: brand.fontBase,
            }}
          >
            *** Thank You ***
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
