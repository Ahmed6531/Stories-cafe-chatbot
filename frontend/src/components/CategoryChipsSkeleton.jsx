import Skeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'

const PLACEHOLDER_COUNT = 8

export default function CategoryChipsSkeleton() {
  return (
    <Box aria-hidden="true" sx={{ position: 'relative', width: '100%' }}>
      <Box sx={{
        width: '100%',
        overflowX: 'auto',
        scrollbarWidth: 'none',
        '&::-webkit-scrollbar': { display: 'none' },
        padding: '4px 0 8px',
      }}>
        <Box sx={{
          display: 'flex',
          gap: '12px',
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 'max-content',
          padding: '0 24px',
        }}>
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
            <Box
              key={`category-chip-skeleton-${index}`}
              sx={{
                minWidth: '120px',
                maxWidth: '140px',
                borderRadius: '20px',
                border: '1px solid #e9e9e9',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: '16px 12px',
                gap: '8px',
              }}>
                <Skeleton animation="wave" variant="rounded" width={56} height={56} sx={{ borderRadius: '12px' }} />
                <Skeleton animation="wave" variant="text" width={72} height={18} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}