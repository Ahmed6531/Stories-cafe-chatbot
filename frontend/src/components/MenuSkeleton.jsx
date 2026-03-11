import { Box } from '@mui/material'
import Skeleton from '@mui/material/Skeleton'
import { menuCardLayout } from '../theme/layoutTokens'

const PLACEHOLDER_COUNT = 13
const brand = {
  border: '#e0e0e0',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
}

export default function MenuSkeleton() {
  return (
    <Box sx={{ width: '100%' }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: menuCardLayout.grid.lg,
          gap: menuCardLayout.gap.lg,
          padding: '24px 0',
          '@media (max-width: 1200px)': {
            gridTemplateColumns: menuCardLayout.grid.md,
            gap: menuCardLayout.gap.md,
          },
          '@media (max-width: 900px)': {
            gridTemplateColumns: menuCardLayout.grid.sm,
            gap: menuCardLayout.gap.md,
            padding: '16px 0',
          },
          '@media (max-width: 600px)': {
            gridTemplateColumns: menuCardLayout.grid.xs,
            gap: menuCardLayout.gap.xs,
            padding: '10px 0 16px',
          },
          '@media (orientation: landscape) and (max-width: 900px)': {
            gridTemplateColumns: menuCardLayout.grid.landscape,
            gap: menuCardLayout.gap.landscape,
          },
        }}
      >
        {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
          <Box
            key={`menu-skeleton-${index}`}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              position: 'relative',
              height: `${menuCardLayout.cardHeight.desktop}px`,
              borderRadius: '12px',
              overflow: 'hidden',
              border: `1px solid ${brand.border}`,
              backgroundColor: '#fff',
              boxShadow: brand.shadowSm,
              '@media (max-width: 600px)': {
                height: `${menuCardLayout.cardHeight.mobile}px`,
                borderRadius: '10px',
              },
            }}
          >
            <Skeleton
              animation="wave"
              variant="circular"
              width={32}
              height={32}
              sx={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                zIndex: 2,
                bgcolor: 'rgba(255,255,255,0.9)',
                '@media (max-width: 600px)': {
                  width: 28,
                  height: 28,
                  top: '8px',
                  right: '8px',
                },
              }}
            />
            <Skeleton
              animation="wave"
              variant="rectangular"
              width="100%"
              height={menuCardLayout.imageHeight.desktop}
              sx={{
                transform: 'none',
                transformOrigin: 'center',
                bgcolor: '#eef2ef',
                '@media (max-width: 600px)': {
                  height: `${menuCardLayout.imageHeight.mobile}px`,
                },
              }}
            />
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                flex: 1,
                gap: '4px',
                padding: `${menuCardLayout.contentPadding.desktop}px`,
                background: brand.bgLight,
                '@media (max-width: 600px)': {
                  padding: `${menuCardLayout.contentPadding.mobile}px`,
                },
              }}
            >
              <Skeleton animation="wave" variant="text" width="62%" height={22} />
              <Skeleton animation="wave" variant="text" width="88%" height={16} />
              <Skeleton animation="wave" variant="text" width="74%" height={16} />
              <Box
                sx={{
                  marginTop: 'auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Skeleton
                  animation="wave"
                  variant="rounded"
                  width={92}
                  height={26}
                  sx={{ borderRadius: '20px' }}
                />
                <Skeleton animation="wave" variant="text" width={90} height={30} />
              </Box>
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}
