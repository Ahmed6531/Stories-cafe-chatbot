import { Box, Button, Card, CardContent, Divider, Stack, Typography } from '@mui/material'
import { formatLL } from '../data/variantCatalog'
import { calculateOrderTotals } from '../utils/orderPricing'

const brand = {
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  paper: '#fdfcfb',
  border: '#e0ddd5',
}

export default function CartSummary({
  items = [],
  mode = 'cartSummary',
  title = 'Order Summary',
  action,
  sx,
}) {
  const { subtotal, tax, total } = calculateOrderTotals(items)
  const isReceipt = mode === 'receipt'
  const showItemList = isReceipt
  const resolvedTitle = isReceipt ? 'Receipt' : title

  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        borderRadius: '4px',
        borderColor: brand.border,
        bgcolor: brand.paper,
        boxShadow: 'none',
        ...sx,
      }}
    >
      <CardContent sx={{ p: isReceipt ? { xs: 2.5, md: 3.5 } : 2.5 }}>
        <Typography
          variant="subtitle2"
          sx={{
            fontWeight: 800,
            textAlign: isReceipt ? 'center' : 'left',
            mb: isReceipt ? 2.5 : 2,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: brand.textPrimary,
            fontSize: '0.75rem',
          }}
        >
          {resolvedTitle}
        </Typography>

        {items.length === 0 ? (
          <Typography variant="body2" sx={{ color: brand.textSecondary }}>
            Your cart is empty.
          </Typography>
        ) : (
          <>
            {showItemList && (
              <Stack spacing={1.2} sx={{ mb: 2 }}>
                {items.map((item, idx) => (
                  <Stack key={item.lineId || idx} direction="row" justifyContent="space-between" alignItems="baseline">
                    <Typography variant="body2" sx={{ fontSize: '0.85rem', color: brand.textPrimary }}>
                      <Box component="span" sx={{ fontWeight: 700, mr: 0.5, opacity: 0.7 }}>
                        {item.qty}x
                      </Box>
                      {item.name}
                    </Typography>
                    <Typography
                      variant="body2"
                      sx={{
                        fontSize: '0.85rem',
                        fontWeight: 600,
                        fontFamily: isReceipt ? 'monospace' : 'inherit',
                      }}
                    >
                      {formatLL((item.price || 0) * item.qty)}
                    </Typography>
                  </Stack>
                ))}
              </Stack>
            )}

            <Divider
              sx={{
                borderStyle: isReceipt ? 'dashed' : 'solid',
                my: 2,
                borderColor: '#d1cdc2',
                opacity: isReceipt ? 1 : 0.5,
              }}
            />

            <Stack spacing={1}>
              <Stack direction="row" justifyContent="space-between">
                <Typography variant="caption" sx={{ color: brand.textSecondary }}>
                  SUBTOTAL
                </Typography>
                <Typography variant="caption" sx={{ fontFamily: isReceipt ? 'monospace' : 'inherit' }}>
                  {formatLL(subtotal)}
                </Typography>
              </Stack>

              {isReceipt && (
                <>
                  <Stack direction="row" justifyContent="space-between" sx={{ mb: 1 }}>
                    <Typography variant="caption" sx={{ color: brand.textSecondary }}>
                      TAX (VAT)
                    </Typography>
                    <Typography variant="caption" sx={{ fontFamily: 'monospace' }}>
                      {formatLL(tax)}
                    </Typography>
                  </Stack>
                  <Divider sx={{ borderStyle: 'dashed', mb: 2, borderColor: '#d1cdc2' }} />
                </>
              )}

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography variant="body2" fontWeight={800} sx={{ letterSpacing: '0.05em' }}>
                  TOTAL
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={900}
                  sx={{
                    color: brand.primaryDark,
                    fontFamily: isReceipt ? 'monospace' : 'inherit',
                    fontSize: isReceipt ? '1.25rem' : '1.1rem',
                  }}
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
            }}
          >
            *** Thank You ***
          </Typography>
        )}
      </CardContent>
    </Card>
  )
}
