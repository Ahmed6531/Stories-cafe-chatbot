import { Box, styled } from '@mui/material'
import { useDragScroll } from '../../hooks/useDragScroll'
import { categoryChipLayout } from '../../theme/layoutTokens'

const categoryImages = {
  Coffee: '/images/coffee.png',
  'Mixed Beverages': '/images/mixedbev.png',
  Pastries: '/images/pastries.png',
  Salad: '/images/salad.png',
  Sandwiches: '/images/sandwiches.png',
  'Soft Drinks': '/images/soft-drinks.png',
  Tea: '/images/tea.png',
  Yogurts: '/images/yogurt.png',
}

const RailWrap = styled(Box)(({ theme }) => ({
  position: 'relative',
  width: '100%',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    right: '-1px',
    width: '38px',
    height: '100%',
    background: 'linear-gradient(to right, rgba(255,255,255,0), rgba(255,255,255,0.78) 72%, #fff 100%)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: '-1px',
    width: '28px',
    height: '100%',
    background: 'linear-gradient(to left, rgba(255,255,255,0), rgba(255,255,255,0.56) 76%, #fff 100%)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  [theme.breakpoints.down('md')]: {
    '&::after': { width: '30px' },
    '&::before': { width: '22px' },
  },
}))

const RailScroller = styled(Box)(() => ({
  width: '100%',
  overflowX: 'auto',
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  padding: '4px 0 8px',
  overscrollBehaviorX: 'contain',
  cursor: 'grab',
  '&::-webkit-scrollbar': {
    display: 'none',
  },
}))

const RailInner = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: categoryChipLayout.railGap.lg,
  flexWrap: 'nowrap',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'max-content',
  padding: categoryChipLayout.railPadding.lg,
  [theme.breakpoints.down('lg')]: {
    gap: categoryChipLayout.railGap.md,
    padding: categoryChipLayout.railPadding.md,
  },
  [theme.breakpoints.down('md')]: {
    gap: categoryChipLayout.railGap.xs,
    padding: categoryChipLayout.railPadding.xs,
  },
}))

const RailChip = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ theme, isActive }) => ({
  padding: 0,
  border: '1px solid #d6e4dd',
  backgroundColor: '#ffffff',
  color: '#1a4a35',
  borderRadius: `${categoryChipLayout.radius.lg}px`,
  fontFamily: theme.brand.fontBase,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  boxShadow: theme.brand.shadowSm,
  overflow: 'hidden',
  minWidth: `${categoryChipLayout.widths.lg.min}px`,
  maxWidth: `${categoryChipLayout.widths.lg.max}px`,
  flexShrink: 0,
  [theme.breakpoints.down('lg')]: {
    minWidth: `${categoryChipLayout.widths.md.min}px`,
    maxWidth: `${categoryChipLayout.widths.md.max}px`,
    fontSize: '13px',
    borderRadius: `${categoryChipLayout.radius.md}px`,
  },
  [theme.breakpoints.down('md')]: {
    minWidth: `${categoryChipLayout.widths.xs.min}px`,
    maxWidth: `${categoryChipLayout.widths.xs.max}px`,
    fontSize: '12px',
    borderRadius: `${categoryChipLayout.radius.xs}px`,
  },
  ...(isActive
    ? {
        background: theme.brand.primary,
        color: '#ffffff',
        borderColor: theme.brand.primary,
        boxShadow: '0 6px 16px rgba(0, 112, 74, 0.18)',
        transform: 'translateY(-1px)',
        '& img': {
          background: 'transparent',
        },
        '&:hover': {
          background: theme.brand.primaryHover,
          borderColor: theme.brand.primaryHover,
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 18px rgba(0, 112, 74, 0.22)',
        },
      }
    : {
        '&:hover': {
          backgroundColor: '#f8fcfa',
          borderColor: '#b7cec2',
          color: '#1a4a35',
          transform: 'translateY(-2px)',
          boxShadow: '0 8px 18px rgba(17, 24, 39, 0.08)',
          '& img': {
            transform: 'scale(1.1)',
          },
        },
      }),
}))

const RailChipContent = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: categoryChipLayout.contentPadding.lg,
  gap: categoryChipLayout.gap.lg,
  [theme.breakpoints.down('lg')]: {
    padding: categoryChipLayout.contentPadding.md,
    gap: categoryChipLayout.gap.md,
  },
  [theme.breakpoints.down('md')]: {
    padding: categoryChipLayout.contentPadding.xs,
    gap: categoryChipLayout.gap.xs,
  },
}))

const RailChipImage = styled('img')(({ theme }) => ({
  width: `${categoryChipLayout.image.lg}px`,
  height: `${categoryChipLayout.image.lg}px`,
  objectFit: 'cover',
  borderRadius: `${categoryChipLayout.imageRadius.lg}px`,
  background: 'transparent',
  transition: 'transform 0.3s ease',
  pointerEvents: 'none',
  userSelect: 'none',
  WebkitUserDrag: 'none',
  [theme.breakpoints.down('lg')]: {
    width: `${categoryChipLayout.image.md}px`,
    height: `${categoryChipLayout.image.md}px`,
    borderRadius: `${categoryChipLayout.imageRadius.md}px`,
  },
  [theme.breakpoints.down('md')]: {
    width: `${categoryChipLayout.image.xs}px`,
    height: `${categoryChipLayout.image.xs}px`,
    borderRadius: `${categoryChipLayout.imageRadius.xs}px`,
  },
}))

const RailChipText = styled('span')(({ theme }) => ({
  fontSize: categoryChipLayout.text.lg,
  fontWeight: 700,
  textAlign: 'center',
  lineHeight: 1.2,
  display: 'block',
  [theme.breakpoints.down('lg')]: {
    fontSize: categoryChipLayout.text.md,
  },
  [theme.breakpoints.down('md')]: {
    fontSize: categoryChipLayout.text.xs,
  },
}))

const EmptyText = styled('span')(({ theme }) => ({
  color: theme.brand.textSecondary,
  fontFamily: theme.brand.fontBase,
}))

function getCategoryLabel(category) {
  return category === 'Mixed Beverages' ? 'Mixed Bev.' : category
}

export default function CategoryRail({
  categories,
  activeCategory,
  onCategorySelect,
  emptyText = 'No categories found.',
}) {
  const { ref, onMouseDown } = useDragScroll()

  if (categories.length === 0) {
    return emptyText ? <EmptyText>{emptyText}</EmptyText> : null
  }

  return (
    <RailWrap>
      <RailScroller ref={ref} onMouseDown={onMouseDown}>
        <RailInner>
          {categories.map((category) => (
            <RailChip
              key={category}
              type="button"
              isActive={activeCategory === category}
              onClick={() => onCategorySelect(category)}
            >
              <RailChipContent>
                <RailChipImage
                  src={categoryImages[category] || '/images/placeholder.png'}
                  alt={category}
                  draggable={false}
                  onError={(event) => {
                    event.currentTarget.src = '/images/placeholder.png'
                  }}
                />
                <RailChipText>{getCategoryLabel(category)}</RailChipText>
              </RailChipContent>
            </RailChip>
          ))}
        </RailInner>
      </RailScroller>
    </RailWrap>
  )
}
