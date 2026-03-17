// migrated from menu.css
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Box, Typography, styled } from '@mui/material'
import CategoryRail from '../components/menu/CategoryRail'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import MenuSkeleton from '../components/MenuSkeleton'
import MenuList from '../components/MenuList'
import { fetchFeaturedMenu, fetchMenuCategories } from '../API/menuApi'

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

export default function Home() {
  const navigate = useNavigate()
  const [categories, setCategories] = useState([])
  const [featuredItems, setFeaturedItems] = useState([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [featuredLoading, setFeaturedLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState(null)
  const [featuredError, setFeaturedError] = useState(null)

  useEffect(() => {
    let active = true

    const loadHomeMenu = async () => {
      setCategoriesLoading(true)
      setFeaturedLoading(true)

      fetchMenuCategories()
        .then((nextCategories) => {
          if (!active) return
          setCategories(nextCategories)
          setCategoriesError(null)
        })
        .catch(() => {
          if (!active) return
          setCategories([])
          setCategoriesError('Failed to load menu. Please try again later.')
        })
        .finally(() => {
          if (active) {
            setCategoriesLoading(false)
          }
        })

      fetchFeaturedMenu()
        .then((nextFeaturedItems) => {
          if (!active) return
          setFeaturedItems(nextFeaturedItems)
          setFeaturedError(null)
        })
        .catch(() => {
          if (!active) return
          setFeaturedItems([])
          setFeaturedError('Failed to load menu. Please try again later.')
        })
        .finally(() => {
          if (active) {
            setFeaturedLoading(false)
          }
        })
    }

    loadHomeMenu()

    return () => {
      active = false
    }
  }, [])

  const pickCategory = (c) => {
    navigate(`/menu/${encodeURIComponent(c)}`)
  }

  return (
    <PageWrap>
      <SectionHeading>
        <SectionLabel component="h2">Categories</SectionLabel>
      </SectionHeading>

      {categoriesLoading ? (
        <CategoryChipsSkeleton />
      ) : categoriesError ? (
        <StatusText isError>{categoriesError}</StatusText>
      ) : (
        <CategoryRail categories={categories} onCategorySelect={pickCategory} />
      )}

      <SectionHeading>
        <SectionLabel component="h2">Featured items</SectionLabel>
      </SectionHeading>

      {featuredLoading ? (
        <MenuSkeleton />
      ) : featuredError ? (
        <StatusText isError>{featuredError}</StatusText>
      ) : featuredItems.length > 0 ? (
        <MenuList items={featuredItems} />
      ) : (
        <p>No featured items available.</p>
      )}
    </PageWrap>
  )
}
