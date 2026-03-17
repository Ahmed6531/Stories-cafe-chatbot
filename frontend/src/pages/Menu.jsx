// migrated from menu.css
import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Box, Typography, styled } from '@mui/material'
import CategoryRail from '../components/menu/CategoryRail'
import MenuList from '../components/MenuList'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import { useMenuData } from '../hooks/useMenuData'

// .page-wrap
const PageWrap = styled(Box)(() => ({
  width: '100%',
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
}));

// .section-heading
const SectionHeading = styled(Box)(() => ({
  marginTop: '4px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '4px',
}));

// .section-title
const SectionLabel = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontDisplay,
  fontSize: '1.5rem',
  fontWeight: 900,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: theme.brand.primary,
  margin: 0,
  textAlign: 'center',
  position: 'relative',
  paddingBottom: '8px',

  [theme.breakpoints.down('md')]: {
    fontSize: '1.25rem',
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
const StateTitle = styled(Typography)(({ theme }) => ({
  margin: 0,
  fontFamily: theme.brand.fontBase,
  fontSize: '28px',
  fontWeight: 600,
  color: theme.brand.primary,
}));

// .state-text
const StatusText = styled(Typography, {
  shouldForwardProp: (prop) => prop !== 'isError',
})(({ theme, isError }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: '16px',
  fontWeight: 500,
  color: isError ? '#b91c1c' : theme.brand.textSecondary,
  margin: 0,
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
})(({ theme, isActive }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: '13px',
  fontWeight: 500,
  padding: '8px 16px',
  borderRadius: '20px',
  border: 'none',
  background: isActive ? theme.brand.primary : '#f5f5f5',
  color: isActive ? '#fff' : '#444',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  flexShrink: 0,
  '&:hover': {
    background: isActive ? theme.brand.primaryHover : '#ececec',
  },
}));

// .primary-btn (RetryBtn)
const RetryBtn = styled('button')(({ theme }) => ({
  border: 0,
  background: theme.brand.primary,
  color: '#fff',
  fontWeight: 900,
  borderRadius: '12px',
  padding: '12px 14px',
  cursor: 'pointer',
  marginTop: '20px',
  fontSize: '16px',
  fontFamily: theme.brand.fontBase,
  '&:hover': { background: theme.brand.primaryHover },
}));

export default function Menu() {
  const navigate = useNavigate()
  const { category } = useParams()
  const [subcategory, setSubcategory] = useState(null)
  const { items, categories, loading, error, hasLoadedCategories } = useMenuData({
    category,
    logErrors: true,
  })

  // Handle category selection - clicking active category deselects it
  const handleCategoryClick = (selectedCategory) => {
    setSubcategory(null)
    if (category === selectedCategory) {
      navigate('/menu')
    } else {
      navigate(`/menu/${encodeURIComponent(selectedCategory)}`)
    }
  }

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
          <SectionLabel component="h2">Categories</SectionLabel>
        </SectionHeading>
        {hasLoadedCategories ? (
          <CategoryRail
            categories={categories}
            activeCategory={category}
            onCategorySelect={handleCategoryClick}
            emptyText={null}
          />
        ) : (
          <CategoryChipsSkeleton />
        )}
        <MenuSkeleton />
      </PageWrap>
    )
  }

  return (
    <PageWrap>
      <SectionHeading>
        <SectionLabel component="h2">Categories</SectionLabel>
      </SectionHeading>

      <CategoryRail
        categories={categories}
        activeCategory={category}
        onCategorySelect={handleCategoryClick}
      />

      <Box sx={{
        overflow: 'hidden',
        maxHeight: subcategories.length > 0 ? '56px' : '0px',
        transition: 'max-height 0.25s ease',
      }}>
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
      </Box>

      <MenuList items={filteredItems} />
    </PageWrap>
  )
}
