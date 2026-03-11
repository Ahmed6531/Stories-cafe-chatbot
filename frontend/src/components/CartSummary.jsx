import { useId } from 'react'
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
  paper: '#ffffff',
  border: '#e5e7eb',
  borderSoft: '#edf2ef',
}

const placeholderImg = 'https://via.placeholder.com/100/8B7355/FFFFFF?text=Coffee'
const receiptPath =
  'M 2 2 H 98 V 96 L 94 98 L 90 96 L 86 98 L 82 96 L 78 98 L 74 96 L 70 98 L 66 96 L 62 98 L 58 96 L 54 98 L 50 96 L 46 98 L 42 96 L 38 98 L 34 96 L 30 98 L 26 96 L 22 98 L 18 96 L 14 98 L 10 96 L 6 98 L 2 96 Z'

export default function CartSummary({
  items = [],
  mode = 'cartSummary',
  title = 'Order Summary',
  action,
  sx,
}) {
  const receiptId = useId().replace(/:/g, '')
  const { updateQty, removeFromCart } = useCart()
  const { subtotal, tax, total } = calculateOrderTotals(items)
  
  const isReceipt = mode === 'receipt'
  const resolvedTitle = isReceipt ? 'Order Summary' : title
  const displayTotal = isReceipt ? total : subtotal
  const totalLabel = isReceipt ? 'TOTAL' : 'SUBTOTAL'

  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        borderRadius: isReceipt ? 0 : '14px',
        borderColor: isReceipt ? 'transparent' : brand.border,
        bgcolor: isReceipt ? 'transparent' : brand.paper,
        boxShadow: isReceipt ? 'none' : '0 2px 10px rgba(17, 24, 39, 0.04)',
        ...(isReceipt && {
          position: 'relative',
          zIndex: 0,
          overflow: 'visible',
          pb: 2,
          border: 'none',
        }),
        ...sx,
      }}
    >
      {isReceipt && (
        <Box
          aria-hidden="true"
          sx={{
            position: 'absolute',
            inset: 0,
            zIndex: -1,
            pointerEvents: 'none',
          }}
        >
          <svg
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            width="100%"
            height="100%"
            style={{ display: 'block', overflow: 'visible' }}
          >
            <defs>
              <linearGradient id={`receipt-fill-${receiptId}`} x1="0%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" stopColor="#ffffff" />
                <stop offset="100%" stopColor="#f9faf9" />
              </linearGradient>
            </defs>
            <path
              d={receiptPath}
              fill={`url(#receipt-fill-${receiptId})`}
              stroke={brand.border}
              strokeWidth="0.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </Box>
      )}
      <CardContent
        sx={{
          position: 'relative',
          zIndex: 1,
          p: isReceipt ? { xs: 2.75, md: 3.5 } : { xs: 2, sm: 2.5 },
          display: isReceipt ? 'flex' : 'block',
          flexDirection: isReceipt ? 'column' : 'unset',
          minHeight: isReceipt ? { xs: 250, md: 280 } : 'auto',
        }}
      >
        <Typography
          variant="subtitle2"
          sx={{
            fontFamily: brand.fontBase,
            fontWeight: 800,
            textAlign: isReceipt ? 'center' : 'left',
            mb: isReceipt ? 2.25 : 2.25,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: isReceipt ? brand.textPrimary : brand.primary,
            fontSize: '0.74rem',
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
            <Stack spacing={isReceipt ? 1.4 : 0}>
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
                    <Stack direction="row" alignItems="center" spacing={1.75} sx={{ py: 1.25 }}>
                      <Box
                        sx={{
                          width: 56,
                          height: 56,
                          borderRadius: '10px',
                          overflow: 'hidden',
                          flexShrink: 0,
                          bgcolor: '#fafbfa',
                          border: '1px solid #edf2ef',
                        }}
                      >
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
                    {index < items.length - 1 && <Divider sx={{ borderColor: '#eef2ef' }} />}
                  </Box>
                )
              })}
            </Stack>

            <Divider
              sx={{
                borderStyle: isReceipt ? 'dashed' : 'solid',
                my: isReceipt ? 2.25 : 2,
                borderColor: '#e7ece8',
                opacity: 1,
              }}
            />

            {/* TOTALS SECTION */}
            <Stack spacing={1}>
              {isReceipt && (
                <>
                  <Stack direction="row" justifyContent="space-between">
                    <Typography
                      variant="caption"
                      sx={{ color: brand.textSecondary, fontWeight: 700, fontFamily: brand.fontBase }}
                    >
                      SUBTOTAL
                    </Typography>
                    <Typography variant="caption" sx={{ fontWeight: 600, fontFamily: brand.fontBase }}>
                      {formatLL(subtotal)}
                    </Typography>
                  </Stack>
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
                  {totalLabel}
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={900}
                  sx={{ color: brand.primaryDark, fontSize: isReceipt ? '1.25rem' : '1.2rem', fontFamily: brand.fontBase }}
                >
                  {formatLL(displayTotal)}
                </Typography>
              </Stack>
            </Stack>
          </>
        )}

        {action && <Box sx={{ mt: 2.5 }}>{action}</Box>}

      </CardContent>
    </Card>
  )
}
