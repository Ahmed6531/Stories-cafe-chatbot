import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../state/useCart'
import {
  Box,
  Button,
  Divider,
  IconButton,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'

const brand = {
  primary: '#00704a',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  fontBase: "'Montserrat', sans-serif",
}

const placeholderImg = 'https://via.placeholder.com/56/8B7355/FFFFFF?text=Coffee'

const formatLL = (value) => `L.L ${Number(value || 0).toLocaleString()}`

export default function MiniCartPopup({ open, onClose, anchorRef }) {
  const navigate = useNavigate()
  const { state } = useCart()
  const { items } = state
  const popupRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const handleClick = (e) => {
      if (
        popupRef.current &&
        !popupRef.current.contains(e.target) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target)
      ) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open, onClose, anchorRef])

  useEffect(() => {
    if (!open) return
    const handleKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  if (!open) return null

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0)
  const recentItems = items.slice(-3).reverse()

  return (
    <Paper
      ref={popupRef}
      elevation={8}
      role="dialog"
      aria-label="Mini cart"
      sx={{
        position: 'fixed',
        top: 60,
        right: 16,
        width: 340,
        maxWidth: 'calc(100vw - 32px)',
        zIndex: 1300,
        borderRadius: '16px',
        overflow: 'hidden',
        border: '1px solid #e0ede6',
        fontFamily: brand.fontBase,
        animation: 'miniCartIn 0.2s cubic-bezier(0.34,1.56,0.64,1)',
        '@keyframes miniCartIn': {
          from: { opacity: 0, transform: 'translateY(-10px) scale(0.97)' },
          to:   { opacity: 1, transform: 'translateY(0) scale(1)' },
        },
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 2, py: 1.5, borderBottom: '1px solid #f0f0f0', bgcolor: '#fff' }}
      >
        <Stack direction="row" alignItems="center" gap={1}>
          <ShoppingCartOutlinedIcon sx={{ fontSize: 18, color: brand.primary }} />
          <Typography fontWeight={800} fontSize={14} fontFamily={brand.fontBase} color={brand.textPrimary}>
            Item added to cart
          </Typography>
        </Stack>
        <IconButton size="small" onClick={onClose} aria-label="Close mini cart">
          <CloseIcon fontSize="small" />
        </IconButton>
      </Stack>

      <Box sx={{ px: 2, py: 1.5, bgcolor: '#fafcfb', maxHeight: 220, overflowY: 'auto' }}>
        {recentItems.length === 0 ? (
          <Typography variant="body2" color={brand.textSecondary} fontFamily={brand.fontBase}>
            Your cart is empty.
          </Typography>
        ) : (
          <Stack spacing={1.2}>
            {recentItems.map((item) => (
              <Stack key={item.lineId} direction="row" spacing={1.5} alignItems="center">
                <Box sx={{ width: 48, height: 48, borderRadius: '10px', overflow: 'hidden', flexShrink: 0, bgcolor: '#f0ede8' }}>
                  <Box
                    component="img"
                    src={item.image || placeholderImg}
                    alt={item.name}
                    onError={(e) => { e.currentTarget.src = placeholderImg }}
                    sx={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="body2" fontWeight={700} fontFamily={brand.fontBase} noWrap color={brand.textPrimary}>
                    {item.name}
                  </Typography>
                  <Typography variant="caption" color={brand.textSecondary} fontFamily={brand.fontBase}>
                    x{item.qty} · {formatLL((item.price || 0) * item.qty)}
                  </Typography>
                </Box>
              </Stack>
            ))}
            {items.length > 3 && (
              <Typography variant="caption" color={brand.textSecondary} fontFamily={brand.fontBase}>
                +{items.length - 3} more item{items.length - 3 > 1 ? 's' : ''} in cart
              </Typography>
            )}
          </Stack>
        )}
      </Box>

      {items.length > 0 && (
        <>
          <Divider />
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ px: 2, py: 1, bgcolor: '#fff' }}>
            <Typography variant="body2" color={brand.textSecondary} fontFamily={brand.fontBase}>
              Subtotal ({state.count} item{state.count !== 1 ? 's' : ''})
            </Typography>
            <Typography variant="body2" fontWeight={800} fontFamily={brand.fontBase} color={brand.primaryDark}>
              {formatLL(subtotal)}
            </Typography>
          </Stack>
        </>
      )}

      <Divider />

      <Stack spacing={1} sx={{ p: 2, bgcolor: '#fff' }}>
        <Button
          fullWidth
          variant="contained"
          endIcon={<ArrowForwardIcon />}
          onClick={() => { onClose(); navigate('/cart') }}
          sx={{
            borderRadius: '10px',
            py: 1.1,
            fontWeight: 700,
            fontSize: '0.875rem',
            fontFamily: brand.fontBase,
            textTransform: 'none',
            backgroundColor: brand.primaryDark,
            '&:hover': { backgroundColor: brand.primary, transform: 'translateY(-1px)' },
            transition: 'all 0.2s ease',
          }}
        >
          Go to Cart
        </Button>
        <Button
          fullWidth
          variant="outlined"
          onClick={() => { onClose(); navigate('/checkout') }}
          sx={{
            borderRadius: '10px',
            py: 1.1,
            fontWeight: 700,
            fontSize: '0.875rem',
            fontFamily: brand.fontBase,
            textTransform: 'none',
            borderColor: '#c7ddd1',
            color: brand.primaryDark,
            '&:hover': { borderColor: brand.primary, backgroundColor: 'rgba(0,112,74,0.05)' },
          }}
        >
          Checkout Now
        </Button>
        <Button
          fullWidth
          variant="text"
          onClick={onClose}
          sx={{
            fontWeight: 600,
            fontSize: '0.8rem',
            fontFamily: brand.fontBase,
            textTransform: 'none',
            color: brand.textSecondary,
            '&:hover': { color: brand.primary, backgroundColor: 'transparent' },
          }}
        >
          Continue Shopping
        </Button>
      </Stack>
    </Paper>
  )
}