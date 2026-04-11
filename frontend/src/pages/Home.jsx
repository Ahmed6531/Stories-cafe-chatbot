// migrated from menu.css
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'
import { useTheme } from '@mui/material/styles'
import CategoryRail from '../components/menu/CategoryRail'
import { PageWrap, SectionHeading, SectionLabel, StatusText } from '../components/menu/MenuPageChrome'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import MenuSkeleton from '../components/MenuSkeleton'
import MenuList from '../components/MenuList'
import { fetchFeaturedMenu, fetchMenuCategories } from '../API/menuApi'
import { getActiveOrder } from '../utils/activeOrder'

export default function Home() {
  const navigate = useNavigate()
  const theme = useTheme()
  const activeOrder = getActiveOrder()
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
      {activeOrder && (
        <Box
          component="button"
          type="button"
          onClick={() => navigate('/success')}
          sx={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            marginBottom: '16px',
            backgroundColor: '#f0fdf4',
            border: `1px solid ${theme.brand.primary}33`,
            borderRadius: '10px',
            cursor: 'pointer',
            fontFamily: theme.brand.fontBase,
            fontSize: '14px',
            fontWeight: 600,
            color: theme.brand.primary,
            transition: 'background-color 0.2s',
            '&:hover': { backgroundColor: '#dcfce7' },
          }}
        >
          <span>You have an active order — tap to track</span>
          <span style={{ fontSize: '18px' }}>&rsaquo;</span>
        </Box>
      )}

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
