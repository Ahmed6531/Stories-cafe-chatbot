import { useId, useState } from 'react'
import { Box, Card, CardContent, Divider, IconButton, Stack, Typography } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import RemoveIcon from '@mui/icons-material/Remove'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTheme } from '@mui/material/styles'
import { formatLL } from '../utils/currency'
import { calculateOrderTotals } from '../utils/orderPricing'
import { useCart } from '../state/useCart'
import { useNavigate } from 'react-router-dom'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'

const receiptPath =
  'M 2 2 H 98 V 96 L 94 98 L 90 96 L 86 98 L 82 96 L 78 98 L 74 96 L 70 98 L 66 96 L 62 98 L 58 96 L 54 98 L 50 96 L 46 98 L 42 96 L 38 98 L 34 96 L 30 98 L 26 96 L 22 98 L 18 96 L 14 98 L 10 96 L 6 98 L 2 96 Z'

function formatGroupLabel(groupId) {
  if (!groupId) return ''
  return String(groupId)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatSelections(selectedOptions = []) {
  // Collect values keyed by group label so same-group options are joined together
  const grouped = new Map()

  for (const selection of selectedOptions) {
    if (!selection) continue

    if (typeof selection === 'string') {
      const key = ''
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key).push(selection)
      continue
    }

    const group = selection.groupName || formatGroupLabel(selection.groupId)
    const option = selection.optionName || selection.name || ''
    const sub = selection.suboptionName || selection.sub || ''
    if (!option) continue

    const value = sub ? `${option} (${sub})` : option
    const key = group || ''
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key).push(value)
  }

  const parts = []
  for (const [group, values] of grouped) {
    parts.push(group ? `${group}: ${values.join(', ')}` : values.join(', '))
  }
  return parts.filter(Boolean).join(' · ')
}

function SummaryItemImage({ image, name }) {
  const [imageError, setImageError] = useState(false)
  const showPlaceholder = !image || imageError

  if (showPlaceholder) {
    return (
      <Box
        sx={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#b0b8be',
          bgcolor: '#fff',
        }}
      >
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </Box>
    )
  }

  return (
    <Box
      component="img"
      src={image}
      alt={name}
      onError={() => setImageError(true)}
      sx={{ width: '100%', height: '100%', objectFit: 'contain', bgcolor: '#fff' }}
    />
  )
}

export default function CartSummary({
  items = [],
  mode = 'cartSummary',
  title = 'Order Summary',
  headerAction,
  action,
  itemsContent,
  sx,
}) {
  const theme = useTheme()
  const { brand } = theme
  const receiptId = useId().replace(/:/g, '')
  const navigate = useNavigate()
  const { updateQty, removeFromCart } = useCart()
  const [pendingRemove, setPendingRemove] = useState(() => new Set())
  const { subtotal, tax, total } = calculateOrderTotals(items)

  const isReceipt = mode === 'receipt'
  const resolvedTitle = isReceipt ? 'Order Summary' : title
  const displayTotal = isReceipt ? total : subtotal
  const totalLabel = isReceipt ? 'TOTAL' : 'SUBTOTAL'
  const showSummaryBreakdown = Boolean(itemsContent) || items.length > 0

  const handleRemove = (lineId) => {
    if (pendingRemove.has(lineId)) return

    setPendingRemove((prev) => {
      const next = new Set(prev)
      next.add(lineId)
      return next
    })

    Promise.resolve(removeFromCart(lineId)).finally(() => {
      setPendingRemove((prev) => {
        const next = new Set(prev)
        next.delete(lineId)
        return next
      })
    })
  }

  return (
    <Card
      variant="outlined"
      sx={{
        width: '100%',
        borderRadius: isReceipt ? 0 : '14px',
        borderColor: isReceipt ? 'transparent' : brand.borderCard,
        bgcolor: isReceipt ? 'transparent' : '#ffffff',
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
              stroke={brand.borderCard}
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
          p: isReceipt ? { xs: 2.75, md: 3.5 } : { xs: 1.5, sm: 2 },
          display: isReceipt ? 'flex' : 'block',
          flexDirection: isReceipt ? 'column' : 'unset',
          minHeight: isReceipt ? { xs: 250, md: 280 } : 'auto',
        }}
      >
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          spacing={1}
          sx={{ mb: 2.25 }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              fontFamily: brand.fontBase,
              fontWeight: 800,
              textAlign: isReceipt ? 'center' : 'left',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isReceipt ? brand.textPrimary : brand.primary,
              fontSize: '0.74rem',
            }}
          >
            {resolvedTitle}
          </Typography>
          {!isReceipt && headerAction}
        </Stack>

        {!showSummaryBreakdown ? (
          <Typography
            variant="body2"
            sx={{ color: brand.textSecondary, py: 2, fontFamily: brand.fontBase }}
          >
            Your cart is empty.
          </Typography>
        ) : (
          <>
            {itemsContent ? (
              itemsContent
            ) : (
              <Stack spacing={isReceipt ? 1.4 : 0}>
                {items.map((item, index) => {
                  if (isReceipt) {
                    return (
                      <Stack
                        key={item.lineId || index}
                        direction="row"
                        justifyContent="space-between"
                        alignItems="baseline"
                      >
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

                  const instructions = item.instructions?.trim()
                  const displayOptionSummary = formatSelections(item.selectedOptions)

                  return (
                    <Box key={item.lineId || index} data-testid="cart-line">
                      <Stack
                        direction="row"
                        alignItems="center"
                        spacing={{ xs: 0.75, sm: 1.25 }}
                        sx={{ py: { xs: 0.75, sm: 1 } }}
                      >
                        <Box
                          sx={{
                            width: { xs: 48, sm: 56 },
                            height: { xs: 48, sm: 56 },
                            borderRadius: '8px',
                            overflow: 'hidden',
                            flexShrink: 0,
                            bgcolor: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <SummaryItemImage image={item.image} name={item.name} />
                        </Box>

                        <Box sx={{ flex: 1, minWidth: 0 }}>
                          <Typography
                            variant="body1"
                            sx={{
                              color: brand.textPrimary,
                              fontWeight: 600,
                              fontSize: { xs: '0.9rem', sm: '0.95rem' },
                              lineHeight: { xs: 1.15, sm: 1.2 },
                              fontFamily: brand.fontBase,
                              mb: { xs: 0.3, sm: 0.2 },
                            }}
                          >
                            {item.name}
                          </Typography>
                          <Typography
                            variant="body2"
                            sx={{
                              color: brand.textSecondary,
                              fontWeight: 600,
                              fontFamily: brand.fontBase,
                              fontSize: { xs: '0.8rem', sm: '0.875rem' },
                              lineHeight: 1.2,
                            }}
                          >
                            {formatLL(item.qty > 1 ? (item.price || 0) * item.qty : item.price || 0)}
                          </Typography>
                          {displayOptionSummary && (
                            <Typography
                              variant="body2"
                              sx={{
                                color: brand.textSecondary,
                                fontWeight: 500,
                                fontFamily: brand.fontBase,
                                fontSize: { xs: '0.74rem', sm: '0.8rem' },
                                lineHeight: 1.35,
                                mt: 0.45,
                              }}
                            >
                              {displayOptionSummary}
                            </Typography>
                          )}
                          {instructions && (
                            <Typography
                              variant="body2"
                              sx={{
                                color: brand.textSecondary,
                                fontWeight: 500,
                                fontFamily: brand.fontBase,
                                fontSize: { xs: '0.72rem', sm: '0.78rem' },
                                lineHeight: 1.35,
                                mt: 0.25,
                                fontStyle: 'italic',
                                opacity: 0.9,
                              }}
                            >
                              Note: {instructions}
                            </Typography>
                          )}
                        </Box>

                        <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 0.75 }}>
                          <Stack
                            direction="row"
                            alignItems="center"
                            sx={{
                              border: `1px solid ${brand.border}`,
                              borderRadius: '999px',
                              height: { xs: 28, sm: 30 },
                              px: { xs: 0.25, sm: 0.5 },
                              bgcolor: '#fff',
                            }}
                          >
                            <IconButton
                              size="small"
                              onClick={() => updateQty(item.lineId, item.qty - 1)}
                              disabled={item.qty <= 1}
                              sx={{ width: { xs: 22, sm: 24 }, height: { xs: 22, sm: 24 }, p: 0 }}
                            >
                              <RemoveIcon sx={{ fontSize: { xs: '0.95rem', sm: '1.05rem' } }} />
                            </IconButton>
                            <Typography
                              sx={{
                                minWidth: { xs: 18, sm: 20 },
                                textAlign: 'center',
                                fontWeight: 700,
                                fontSize: { xs: '0.8rem', sm: '0.85rem' },
                                fontFamily: brand.fontBase,
                              }}
                            >
                              {item.qty}
                            </Typography>
                            <IconButton
                              size="small"
                              onClick={() => updateQty(item.lineId, item.qty + 1)}
                              sx={{ width: { xs: 22, sm: 24 }, height: { xs: 22, sm: 24 }, p: 0 }}
                            >
                              <AddIcon sx={{ fontSize: { xs: '0.95rem', sm: '1.05rem' } }} />
                            </IconButton>
                          </Stack>
                          <IconButton
                            onClick={() => navigate(`/item/${item.menuItemId}?edit=${item.lineId}`)}
                            sx={{ color: brand.textSecondary, width: { xs: 24, sm: 28 }, height: { xs: 24, sm: 28 } }}
                            aria-label="Edit item"
                            size="small"
                          >
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                          <IconButton
                            onClick={() => handleRemove(item.lineId)}
                            disabled={pendingRemove.has(item.lineId)}
                            sx={{ color: '#cf2e2e', width: { xs: 24, sm: 28 }, height: { xs: 24, sm: 28 } }}
                            size="small"
                          >
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </Stack>
                      </Stack>

                      {index < items.length - 1 && <Divider sx={{ borderColor: brand.borderSoft }} />}
                    </Box>
                  )
                })}
              </Stack>
            )}

            <Divider
              sx={{
                borderStyle: isReceipt ? 'dashed' : 'solid',
                my: isReceipt ? 2.25 : 2,
                borderColor: brand.borderSoft,
                opacity: 1,
              }}
            />

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
                  <Divider sx={{ borderStyle: 'dashed', mb: 2, borderColor: brand.borderSoft }} />
                </>
              )}

              <Stack direction="row" justifyContent="space-between" alignItems="center">
                <Typography
                  variant="body2"
                  fontWeight={800}
                  sx={{ letterSpacing: '0.05em', fontFamily: brand.fontBase }}
                >
                  {totalLabel}
                </Typography>
                <Typography
                  variant="h6"
                  fontWeight={900}
                  sx={{
                    color: brand.primaryDark,
                    fontSize: isReceipt ? '1.25rem' : '1.2rem',
                    fontFamily: brand.fontBase,
                  }}
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
