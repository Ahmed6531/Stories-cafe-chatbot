// migrated from menu.css
import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Box, Typography, styled } from '@mui/material'
import MenuList from '../components/MenuList'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import { fetchMenu } from '../API/menuApi'

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
const SectionTitle = styled(Typography)(({ theme }) => ({
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

  [theme.breakpoints.down('sm')]: {
    fontSize: '20px',
    letterSpacing: '0.04em',
    paddingBottom: '4px',
  },
}));

// .state-wrap
const StateWrap = styled(Box)(() => ({
  minHeight: '220px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  textAlign: 'center',
}));

// .state-title
const StateTitle = styled(Typography)(() => ({
  margin: 0,
  fontFamily: brand.fontBase,
  fontSize: '28px',
  fontWeight: 600,
  color: brand.primary,
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
  },
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
  },
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

  ...(isActive
    ? {
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

// .subcatbar
const SubcatBar = styled(Box)(() => ({
  display: 'flex',
  gap: '8px',
  marginBottom: '16px',
  flexWrap: 'nowrap',
  justifyContent: 'center',
  overflowX: 'auto',
  width: '100%',
  minWidth: 0,
  padding: '0 8px 4px',
  overscrollBehaviorX: 'contain',
  msOverflowStyle: 'none',
  scrollbarWidth: 'none',
  '&::-webkit-scrollbar': { display: 'none' },
}));

// .subcat-chip
const SubcatChip = styled('button', {
  shouldForwardProp: (prop) => prop !== 'isActive',
})(({ isActive }) => ({
  fontFamily: brand.fontBase,
  fontSize: '13px',
  fontWeight: 500,
  padding: '8px 16px',
  borderRadius: '20px',
  border: 'none',
  background: isActive ? brand.primary : '#f5f5f5',
  color: isActive ? '#fff' : '#444',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  flexShrink: 0,
  '&:hover': {
    background: isActive ? brand.primaryHover : '#ececec',
  },
}));

// .primary-btn (RetryBtn)
const RetryBtn = styled('button')(() => ({
  border: 0,
  background: brand.primary,
  color: '#fff',
  fontWeight: 900,
  borderRadius: '12px',
  padding: '12px 14px',
  cursor: 'pointer',
  marginTop: '20px',
  fontSize: '16px',
  fontFamily: brand.fontBase,
  '&:hover': { background: brand.primaryHover },
}));

export default function Menu() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') // No default - falsy means show all
  const [subcategory, setSubcategory] = useState(null)
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Category image mapping
  const categoryImages = {
    'Coffee': '/images/coffee.png',
    'Mixed Beverages': '/images/mixedbev.png',
    'Pastries': '/images/pastries.png',
    'Salad': '/images/salad.png',
    'Sandwiches': '/images/sandwiches.png',
    'Soft Drinks': '/images/soft-drinks.png',
    'Tea': '/images/tea.png',
    'Yogurts': '/images/yogurt.png',
  }

  // Handle category selection - clicking active category deselects it
  const handleCategoryClick = (selectedCategory) => {
    if (category === selectedCategory) {
      setParams({})
    } else {
      setParams({ category: selectedCategory })
    }
  }

  // Fetch menu data on component mount
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true);
        const data = await fetchMenu(category);
        setItems(data.items);
        setCategories(data.categories);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, [category]);

  // Reset subcategory when main category changes
  useEffect(() => {
    setSubcategory(null)
  }, [category])

  const subcategories = useMemo(() => {
    if (!category) return []
    const uniqueSubcategories = new Set(
      items.map((item) => item.subcategory).filter(Boolean)
    )
    return Array.from(uniqueSubcategories).sort()
  }, [items, category])

  // Items are already filtered by backend category; this applies optional subcategory filtering
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (!i || !i.id || !i.name) return false
      if (!subcategory) return true
      return i.subcategory === subcategory
    })
  }, [items, subcategory])

  if (error) {
    return (
      <PageWrap>
        <StateWrap>
          <StateTitle component="h1">Unable to load menu</StateTitle>
          <StatusText isError>Error: {error}</StatusText>
          <RetryBtn type="button" onClick={() => window.location.reload()}>
            Retry
          </RetryBtn>
        </StateWrap>
      </PageWrap>
    )
  }

  if (loading) {
    return (
      <PageWrap>
        <SectionHeading>
          <SectionTitle component="h2">Categories</SectionTitle>
        </SectionHeading>
        <CategoryChipsSkeleton />
        <MenuSkeleton />
      </PageWrap>
    )
  }

  return (
    <PageWrap>
      <SectionHeading>
        <SectionTitle component="h2">Categories</SectionTitle>
      </SectionHeading>

      <CatbarWrap>
        <Catbar>
          <CatbarInner>
            {categories.length > 0 ? (
              categories.map((c) => (
                <CatChip
                  key={c}
                  type="button"
                  isActive={category === c}
                  onClick={() => handleCategoryClick(c)}
                >
                  <CatChipContent>
                    <CatChipImage
                      src={categoryImages[c] || '/images/placeholder.png'}
                      alt={c}
                      onError={(e) => {
                        e.currentTarget.src = '/images/placeholder.png'
                      }}
                    />
                    <CatChipText>
                      {c === 'Mixed Beverages' ? 'Mixed Bev.' : c}
                    </CatChipText>
                  </CatChipContent>
                </CatChip>
              ))
            ) : (
              <span>No categories found.</span>
            )}
          </CatbarInner>
        </Catbar>
      </CatbarWrap>

      {subcategories.length > 0 && (
        <SubcatBar>
          {subcategories.map((s) => (
            <SubcatChip
              key={s}
              type="button"
              isActive={subcategory === s}
              onClick={() =>
                setSubcategory((prev) => (prev === s ? null : s))
              }
            >
              {s}
            </SubcatChip>
          ))}
        </SubcatBar>
      )}

      <MenuList items={filteredItems} />
    </PageWrap>
  )
}