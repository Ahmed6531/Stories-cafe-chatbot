import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, Card, CardContent, Chip, Divider,
  Skeleton, Stack, Typography
} from '@mui/material'
import { useTheme } from '@mui/material/styles'
import { useSession } from '../hooks/useSession'
import { getMyOrders } from '../API/ordersApi'
import { formatLL } from '../utils/currency'

const STATUS_CONFIG = {
  received:    { label: 'Received',    bg: '#dbeafe', color: '#1d4ed8' },
  in_progress: { label: 'In Progress', bg: '#ffedd5', color: '#c2410c' },
  completed:   { label: 'Completed',   bg: '#dcfce7', color: '#15803d' },
  cancelled:   { label: 'Cancelled',   bg: '#fee2e2', color: '#b91c1c' },
}

const ORDER_TYPE_LABEL = {
  pickup:   'Pickup',
  dine_in:  'Dine In',
  delivery: 'Delivery',
}

export default function Dashboard() {
  const theme = useTheme()
  const { user } = useSession()
  const navigate = useNavigate()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    getMyOrders()
      .then(data => { if (active) setOrders(data.orders || []) })
      .catch(() => { if (active) setError('Failed to load your orders.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  return (
    <Box sx={{
      px: { xs: 2, md: 4 },
      pt: { xs: 2, md: 3 },
      pb: { xs: 4, md: 6 },
      maxWidth: '680px',
      margin: '0 auto',
      fontFamily: theme.brand.fontBase,
      '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
    }}>
      <Typography
        component="h1"
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
        My Orders
      </Typography>

      <Typography sx={{
        textAlign: 'center',
        fontSize: '0.875rem',
        color: theme.brand.textSecondary,
        fontFamily: theme.brand.fontBase,
        mb: 3,
        mt: -1.5,
      }}>
        {user?.email}
      </Typography>

      {loading && Array.from({ length: 3 }).map((_, i) => (
        <Card key={i} variant="outlined" sx={{
          mb: { xs: 1.5, md: 2 },
          borderRadius: '12px',
          border: `1px solid ${theme.brand.borderCard}`,
        }}>
          <CardContent sx={{ p: { xs: 2, md: 2.5 }, '&:last-child': { pb: { xs: 2, md: 2.5 } } }}>
            <Stack direction="row" justifyContent="space-between" mb={1.5}>
              <Skeleton variant="text" width="35%" height={20} />
              <Skeleton variant="text" width="25%" height={20} />
            </Stack>
            <Stack direction="row" gap={1} mb={1.75}>
              <Skeleton variant="rounded" width={80} height={22} sx={{ borderRadius: '999px' }} />
              <Skeleton variant="rounded" width={60} height={22} sx={{ borderRadius: '999px' }} />
            </Stack>
            <Skeleton variant="rectangular" height={1} sx={{ mb: 1.5 }} />
            <Skeleton variant="text" width="70%" height={18} />
            <Skeleton variant="text" width="50%" height={18} />
            <Skeleton variant="rectangular" height={1} sx={{ mt: 1.5, mb: 1.25 }} />
            <Stack direction="row" justifyContent="flex-end">
              <Skeleton variant="text" width="28%" height={20} />
            </Stack>
          </CardContent>
        </Card>
      ))}

      {!loading && error && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography sx={{
            color: theme.brand.error,
            fontFamily: theme.brand.fontBase,
            fontSize: '0.9rem',
            mb: 2,
          }}>
            {error}
          </Typography>
          <Box
            component="button"
            onClick={() => window.location.reload()}
            sx={{
              border: `1.5px solid ${theme.brand.primary}`,
              background: 'transparent',
              color: theme.brand.primary,
              borderRadius: '20px',
              padding: '8px 20px',
              fontSize: '0.875rem',
              fontFamily: theme.brand.fontBase,
              fontWeight: 600,
              cursor: 'pointer',
              '&:hover': { background: 'rgba(0,112,74,0.06)' },
            }}
          >
            Try again
          </Box>
        </Box>
      )}

      {!loading && !error && orders.length === 0 && (
        <Box sx={{ textAlign: 'center', mt: 6 }}>
          <Typography sx={{
            fontSize: '1rem',
            color: theme.brand.textSecondary,
            fontFamily: theme.brand.fontBase,
            mb: 2.5,
          }}>
            You have no past orders yet.
          </Typography>
          <Box
            component="button"
            onClick={() => navigate('/menu')}
            sx={{
              border: 'none',
              backgroundColor: theme.brand.primaryDark,
              color: '#fff',
              fontWeight: 600,
              borderRadius: '8px',
              padding: '12px 28px',
              cursor: 'pointer',
              fontSize: '0.95rem',
              fontFamily: theme.brand.fontBase,
              transition: 'all 0.2s ease',
              '&:hover': { backgroundColor: theme.brand.primary, transform: 'translateY(-1px)' },
            }}
          >
            Browse Menu
          </Box>
        </Box>
      )}

      {!loading && !error && orders.length > 0 && orders.map(order => (
        <Card
          key={order._id}
          variant="outlined"
          sx={{
            mb: { xs: 1.5, md: 2 },
            borderRadius: '12px',
            border: `1px solid ${theme.brand.borderCard}`,
            boxShadow: theme.brand.shadowSm,
            transition: 'box-shadow 0.2s ease',
            '&:hover': { boxShadow: theme.brand.shadowHover },
          }}
        >
          <CardContent sx={{
            p: { xs: 2, md: 2.5 },
            '&:last-child': { pb: { xs: 2, md: 2.5 } },
          }}>
            <Stack
              direction="row"
              justifyContent="space-between"
              alignItems={{ xs: 'flex-start', sm: 'center' }}
              flexWrap="wrap"
              gap={0.5}
              mb={1.25}
            >
              <Typography sx={{
                fontWeight: 700,
                fontSize: { xs: '0.9rem', sm: '1rem' },
                color: theme.brand.textPrimary,
                fontFamily: theme.brand.fontBase,
              }}>
                Order #{order.orderNumber}
              </Typography>
              <Typography sx={{
                fontSize: '0.78rem',
                color: theme.brand.textSecondary,
                fontFamily: theme.brand.fontBase,
                flexShrink: 0,
              }}>
                {new Date(order.createdAt).toLocaleDateString('en-US', {
                  year: 'numeric', month: 'short', day: 'numeric',
                })}
              </Typography>
            </Stack>

            <Stack direction="row" gap={1} flexWrap="wrap" mb={1.75}>
              <Chip
                label={STATUS_CONFIG[order.status]?.label ?? order.status}
                size="small"
                sx={{
                  backgroundColor: STATUS_CONFIG[order.status]?.bg ?? '#f3f4f6',
                  color: STATUS_CONFIG[order.status]?.color ?? '#374151',
                  fontWeight: 600,
                  fontSize: '0.72rem',
                  fontFamily: theme.brand.fontBase,
                  height: '22px',
                  borderRadius: '999px',
                }}
              />
              <Chip
                label={ORDER_TYPE_LABEL[order.orderType] ?? order.orderType}
                size="small"
                sx={{
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  fontWeight: 500,
                  fontSize: '0.72rem',
                  fontFamily: theme.brand.fontBase,
                  height: '22px',
                  borderRadius: '999px',
                }}
              />
            </Stack>

            <Divider sx={{ mb: 1.5, borderColor: theme.brand.borderLight }} />

            <Stack gap={0.75} mb={1.5}>
              {order.items.map((item, idx) => (
                <Stack
                  key={idx}
                  direction="row"
                  justifyContent="space-between"
                  alignItems="baseline"
                  flexWrap="wrap"
                  gap={0.25}
                >
                  <Typography sx={{
                    fontSize: '0.85rem',
                    color: theme.brand.textPrimary,
                    fontFamily: theme.brand.fontBase,
                  }}>
                    {item.qty}× {item.name}
                  </Typography>
                  <Typography sx={{
                    fontSize: '0.85rem',
                    color: theme.brand.textSecondary,
                    fontFamily: theme.brand.fontBase,
                    flexShrink: 0,
                  }}>
                    {formatLL(item.lineTotal)}
                  </Typography>
                </Stack>
              ))}
            </Stack>

            <Divider sx={{ mb: 1.25, borderColor: theme.brand.borderLight }} />

            <Stack direction="row" justifyContent="flex-end" alignItems="center" gap={0.5}>
              <Typography sx={{
                fontSize: '0.9rem',
                fontWeight: 700,
                color: theme.brand.textPrimary,
                fontFamily: theme.brand.fontBase,
              }}>
                Total:
              </Typography>
              <Typography sx={{
                fontSize: '0.9rem',
                fontWeight: 700,
                color: theme.brand.primary,
                fontFamily: theme.brand.fontBase,
              }}>
                {formlaatLL(order.total)}
              </Typography>
            </Stack>
          </CardContent>
        </Card>
      ))}
    </Box>
  )
}