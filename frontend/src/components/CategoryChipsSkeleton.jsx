import Skeleton from '@mui/material/Skeleton'
import Box from '@mui/material/Box'
import { categoryChipLayout } from '../theme/layoutTokens'

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
          gap: { xs: categoryChipLayout.railGap.xs, md: categoryChipLayout.railGap.md, lg: categoryChipLayout.railGap.lg },
          flexWrap: 'nowrap',
          alignItems: 'center',
          justifyContent: 'center',
          minWidth: 'max-content',
          padding: { xs: categoryChipLayout.railPadding.xs, md: categoryChipLayout.railPadding.md, lg: categoryChipLayout.railPadding.lg },
        }}>
          {Array.from({ length: PLACEHOLDER_COUNT }).map((_, index) => (
            <Box
              key={`category-chip-skeleton-${index}`}
              sx={{
                minWidth: { xs: `${categoryChipLayout.widths.xs.min}px`, md: `${categoryChipLayout.widths.md.min}px`, lg: `${categoryChipLayout.widths.lg.min}px` },
                maxWidth: { xs: `${categoryChipLayout.widths.xs.max}px`, md: `${categoryChipLayout.widths.md.max}px`, lg: `${categoryChipLayout.widths.lg.max}px` },
                borderRadius: { xs: `${categoryChipLayout.radius.xs}px`, md: `${categoryChipLayout.radius.md}px`, lg: `${categoryChipLayout.radius.lg}px` },
                border: '1px solid #e9e9e9',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <Box sx={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                padding: { xs: categoryChipLayout.contentPadding.xs, md: categoryChipLayout.contentPadding.md, lg: categoryChipLayout.contentPadding.lg },
                gap: { xs: categoryChipLayout.gap.xs, md: categoryChipLayout.gap.md, lg: categoryChipLayout.gap.lg },
              }}>
                <Skeleton
                  animation="wave"
                  variant="rounded"
                  width={categoryChipLayout.image.lg}
                  height={categoryChipLayout.image.lg}
                  sx={{
                    width: { xs: `${categoryChipLayout.image.xs}px`, md: `${categoryChipLayout.image.md}px`, lg: `${categoryChipLayout.image.lg}px` },
                    height: { xs: `${categoryChipLayout.image.xs}px`, md: `${categoryChipLayout.image.md}px`, lg: `${categoryChipLayout.image.lg}px` },
                    borderRadius: { xs: `${categoryChipLayout.imageRadius.xs}px`, md: `${categoryChipLayout.imageRadius.md}px`, lg: `${categoryChipLayout.imageRadius.lg}px` },
                  }}
                />
                <Skeleton animation="wave" variant="text" width={72} height={18} sx={{ fontSize: { xs: categoryChipLayout.text.xs, md: categoryChipLayout.text.md, lg: categoryChipLayout.text.lg } }} />
              </Box>
            </Box>
          ))}
        </Box>
      </Box>
    </Box>
  )
}
