import { Box, Divider, Stack } from '@mui/material'
import Skeleton from '@mui/material/Skeleton'
import { useTheme } from '@mui/material/styles'

const PLACEHOLDER_ROWS = 3

export default function CartItemsSkeleton() {
  const theme = useTheme()
  const { brand } = theme

  return (
    <Stack spacing={0} aria-hidden="true">
      {Array.from({ length: PLACEHOLDER_ROWS }).map((_, index) => (
        <Box key={`cart-items-skeleton-${index}`}>
          <Stack
            direction="row"
            alignItems="center"
            spacing={{ xs: 0.75, sm: 1.25 }}
            sx={{ py: { xs: 0.75, sm: 1 } }}
          >
            <Skeleton
              animation="wave"
              variant="rounded"
              width={56}
              height={56}
              sx={{
                width: { xs: 48, sm: 56 },
                height: { xs: 48, sm: 56 },
                borderRadius: '8px',
                flexShrink: 0,
                bgcolor: '#eceff1',
              }}
            />

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Skeleton
                animation="wave"
                variant="text"
                width="58%"
                height={22}
                sx={{ mb: 0.2 }}
              />
              <Skeleton
                animation="wave"
                variant="text"
                width="34%"
                height={18}
              />
            </Box>

            <Stack direction="row" alignItems="center" spacing={{ xs: 0.5, sm: 0.75 }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={74}
                height={30}
                sx={{
                  width: { xs: 66, sm: 74 },
                  height: { xs: 28, sm: 30 },
                  borderRadius: '999px',
                }}
              />
              <Skeleton
                animation="wave"
                variant="circular"
                width={28}
                height={28}
                sx={{
                  width: { xs: 24, sm: 28 },
                  height: { xs: 24, sm: 28 },
                  flexShrink: 0,
                }}
              />
            </Stack>
          </Stack>

          {index < PLACEHOLDER_ROWS - 1 && <Divider sx={{ borderColor: brand.borderSoft }} />}
        </Box>
      ))}
    </Stack>
  )
}
