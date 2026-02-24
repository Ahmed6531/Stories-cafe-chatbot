// migrated from menu.css
import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, styled } from '@mui/material'
import FeaturedItems from '../components/FeaturedItems'
import { fetchMenu } from '../API/menuApi'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import MenuSkeleton from '../components/MenuSkeleton'

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  borderLight: '#e9e9e9',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

// .page-wrap
const PageWrap = styled(Box)(() => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '14px',
}));

// .section-heading
const SectionHeading = styled(Box)(() => ({
  marginTop: '10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
}));

// .section-title
const SectionTitle = styled(Typography)(() => ({
  fontFamily: brand.fontDisplay,
  fontSize: '28px',
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: brand.primary,
  margin: 0,
  textAlign: 'center',
  position: 'relative',
  paddingBottom: '8px',
}));

// .state-text
const StatusText = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'isError',
})(({ isError }) => ({
  fontFamily: brand.fontBase,
  fontSize: '16px',
  fontWeight: 500,
  color: isError ? '#b91c1c' : brand.textSecondary,
  margin: 0,
}));

// .catbar-wrap
const CatbarWrap = styled(Box)(() => ({
  position: 'relative',
  width: '100%',
  '&::after': {
    content: '""',
    position: 'absolute',
    top: 0,
    right: 0,
    width: '56px',
    height: '100%',
    background: 'linear-gradient(to right, transparent, #fff)',
    pointerEvents: 'none',
    zIndex: 1,
  },
  '&::before': {
    content: '""',
    position: 'absolute',
    top: 0,
    left: 0,
    width: '56px',
    height: '100%',
    background: 'linear-gradient(to left, transparent, #fff)',
    pointerEvents: 'none',
    zIndex: 1,
  }
}));

// .catbar
const Catbar = styled(Box)(() => ({
  width: '100%',
  overflowX: 'auto',
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  padding: '4px 0 8px',
  overscrollBehaviorX: 'contain',
  '&::-webkit-scrollbar': {
    display: 'none',
  }
}));

// .catbar-inner
const CatbarInner = styled(Box)(() => ({
  display: 'flex',
  gap: '12px',
  flexWrap: 'nowrap',
  alignItems: 'center',
  justifyContent: 'center',
  minWidth: 'max-content',
  padding: '0 24px',
}));

// .cat-chip
const CatChip = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ isActive }) => ({
  padding: 0,
  border: '1px solid #d6e4dd',
  backgroundColor: '#ffffff',
  color: '#1a4a35',
  borderRadius: '20px',
  fontFamily: brand.fontBase,
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  whiteSpace: 'nowrap',
  userSelect: 'none',
  boxShadow: brand.shadowSm,
  overflow: 'hidden',
  minWidth: '120px',
  maxWidth: '140px',
  flexShrink: 0,

  ...(isActive ? {
    background: brand.primary,
    color: '#ffffff',
    borderColor: brand.primary,
    boxShadow: '0 6px 16px rgba(0, 112, 74, 0.18)',
    transform: 'translateY(-1px)',
    '& img': {
      background: 'transparent',
    },
    '&:hover': {
      background: brand.primaryHover,
      borderColor: brand.primaryHover,
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 18px rgba(0, 112, 74, 0.22)',
    }
  } : {
    '&:hover': {
      backgroundColor: '#f8fcfa',
      borderColor: '#b7cec2',
      color: '#1a4a35',
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 18px rgba(17, 24, 39, 0.08)',
      '& img': {
        transform: 'scale(1.1)',
      }
    }
  })
}));

// .cat-chip-content
const CatChipContent = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: '16px 12px',
  gap: '8px',
}));

// .cat-chip-image
const CatChipImage = styled('img')(() => ({
  width: '56px',
  height: '56px',
  objectFit: 'cover',
  borderRadius: '12px',
  background: 'transparent',
  transition: 'transform 0.3s ease',
}));

// .cat-chip-text
const CatChipText = styled('span')(() => ({
  fontSize: '13px',
  fontWeight: 700,
  textAlign: 'center',
  lineHeight: 1.2,
  display: 'block',
}));

export default function Home() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Category image mapping
  const categoryImages = {
    'Coffee': '/images/coffee.png',
    'Mixed Beverages': '/images/mixedbev.png',
    'Pastries': '/images/pastries.png',
    'Salad': '/images/salad.jpg',
    'Sandwiches': '/images/sandwiches.png',
    'Soft Drinks': '/images/soft-drinks.png',
    'Tea': '/images/tea.png',
    'Yogurts': '/images/yogurt.png'
  }

  // Fetch menu data on component mount
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchMenu()
        setItems(data.items)
        setCategories(data.categories)
      } catch {
        setError('Failed to load menu. Please try again later.')
        setItems([])
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    loadMenu()
  }, [])

  const featured = useMemo(() => {
    return items.filter((i) => i.isFeatured)
  }, [items])

  const pickCategory = (c) => {
    navigate(`/menu?category=${encodeURIComponent(c)}`)
  }

  return (
    <PageWrap>
      <SectionHeading>
        <SectionTitle component="h2">Categories</SectionTitle>
      </SectionHeading>

      {loading ? (
        <CategoryChipsSkeleton />
      ) : error ? (
        <StatusText isError>{error}</StatusText>
      ) : categories.length > 0 ? (
        <CatbarWrap>
          <Catbar>
            <CatbarInner>
              {categories.map((c) => (
                <CatChip key={c} type="button" onClick={() => pickCategory(c)}>
                  <CatChipContent>
                    <CatChipImage
                      src={categoryImages[c] || '/images/placeholder.png'}
                      alt={c}
                      onError={(e) => { e.currentTarget.src = '/images/placeholder.png' }}
                    />
                    <CatChipText>{c === 'Mixed Beverages' ? 'Mixed Bev.' : c}</CatChipText>
                  </CatChipContent>
                </CatChip>
              ))}
            </CatbarInner>
          </Catbar>
        </CatbarWrap>
      ) : (
        <span>No categories found.</span>
      )}

      <SectionHeading>
        <SectionTitle component="h2">Featured items</SectionTitle>
      </SectionHeading>

      {loading ? (
        <MenuSkeleton />
      ) : error ? (
        <StatusText isError>{error}</StatusText>
      ) : featured.length > 0 ? (
        <FeaturedItems items={featured} />
      ) : (
        <p>No featured items available.</p>
      )}
    </PageWrap>
  )
}

// Removed classes from menu.css dependency:
// .page-wrap, .section-heading, .section-title, .featured-section-heading
// .state-text, .state-text.error, .catbar-wrap, .catbar, .catbar-inner
// .cat-chip, .cat-chip-content, .cat-chip-image, .cat-chip-text