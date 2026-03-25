import Skeleton from '@mui/material/Skeleton'
import {
  Box,
  Card,
  CardContent,
  Container,
  Divider,
  Stack,
} from '@mui/material'

export default function MenuItemDetailsSkeleton() {
  return (
    <Container
      aria-hidden="true"
      sx={{ py: { xs: 1.5, md: 3 }, px: { xs: 1.5, md: 2 } }}
    >
      {/* Back button */}
      <Skeleton animation="wave" variant="text" width={110} height={28} sx={{ mb: 1.5 }} />

      {/* Hero — mobile */}
      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          bgcolor: 'primary.main',
          borderRadius: 3,
          overflow: 'hidden',
          mb: 3,
          border: '1px solid rgba(0, 112, 74, 0.32)',
        }}
      >
        <Box
          sx={{
            bgcolor: '#fff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            px: 2,
            pt: 1,
            pb: 0.5,
          }}
        >
          <Skeleton
            animation="wave"
            variant="rounded"
            sx={{ width: 108, height: 108, borderRadius: 2 }}
          />
        </Box>
        <Box sx={{ px: 1.5, pt: 1, pb: 1.25 }}>
          <Skeleton animation="wave" variant="text" width="55%" height={22} sx={{ mb: 0.5 }} />
          <Skeleton animation="wave" variant="text" width="80%" height={16} sx={{ mb: 0.75 }} />
          <Skeleton animation="wave" variant="text" width="30%" height={26} sx={{ mb: 0.75 }} />
          {/* Qty row */}
          <Stack direction="row" spacing={0.75} alignItems="center">
            <Skeleton animation="wave" variant="rounded" width={28} height={28} sx={{ borderRadius: '8px' }} />
            <Skeleton animation="wave" variant="text" width={16} height={24} />
            <Skeleton animation="wave" variant="rounded" width={28} height={28} sx={{ borderRadius: '8px' }} />
          </Stack>
        </Box>
      </Box>

      {/* Hero — desktop */}
      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          bgcolor: 'primary.main',
          borderRadius: 2,
          p: 2,
          mb: 3,
        }}
      >
        <Stack direction="row" spacing={2} alignItems="center">
          <Skeleton
            animation="wave"
            variant="circular"
            width={92}
            height={92}
            sx={{ flexShrink: 0 }}
          />
          <Box sx={{ flex: 1 }}>
            <Skeleton animation="wave" variant="text" width="45%" height={32} sx={{ mb: 0.5 }} />
            <Skeleton animation="wave" variant="text" width="75%" height={18} />
            <Skeleton animation="wave" variant="text" width="25%" height={28} sx={{ mt: 1 }} />
          </Box>
          {/* Qty row */}
          <Stack direction="row" spacing={1} alignItems="center">
            <Skeleton animation="wave" variant="rounded" width={40} height={36} />
            <Skeleton animation="wave" variant="text" width={24} height={28} />
            <Skeleton animation="wave" variant="rounded" width={40} height={36} />
          </Stack>
        </Stack>
      </Box>

      {/* Options card */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={{ xs: 2, sm: 3 }}>
            {/* Option group row 1 */}
            <Stack
              direction={{ xs: 'column', md: 'row' }}
              spacing={{ xs: 2, md: 3 }}
            >
              {[0, 1, 2].map((i) => (
                <Box key={i} sx={{ flex: 1 }}>
                  <Skeleton animation="wave" variant="text" width="50%" height={22} sx={{ mb: 0.75 }} />
                  <Skeleton animation="wave" variant="rounded" width="100%" height={40} sx={{ borderRadius: 1 }} />
                </Box>
              ))}
            </Stack>

            <Divider />

            {/* Special instructions */}
            <Skeleton animation="wave" variant="rounded" width="100%" height={80} sx={{ borderRadius: 1 }} />

            {/* Footer row */}
            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              alignItems={{ sm: 'center' }}
              spacing={1.25}
            >
              <Skeleton animation="wave" variant="text" width={130} height={28} />
              <Skeleton
                animation="wave"
                variant="rounded"
                width={140}
                height={44}
                sx={{ borderRadius: 2 }}
              />
            </Stack>
          </Stack>
        </CardContent>
      </Card>
    </Container>
  )
}
