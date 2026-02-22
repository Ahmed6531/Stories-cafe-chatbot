import { Container, Typography, Box, Button, Stack, Paper, Grid } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { Coffee, MenuBook } from '@mui/icons-material'
import { useMemo, useState, useEffect } from 'react'
import { fetchMenu } from '../API/menuApi'
import FeaturedItems from '../components/FeaturedItems'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'

export default function Home() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const categoryImages = {
    'Coffee': '/images/coffee.png',
    'Mixed Beverages': '/images/mixedbev.png',
    'Pastries': '/images/pastries.png',
    'Salad': '/images/salad.png',
    'Sandwiches': '/images/sandwiches.png',
    'Soft Drinks': '/images/soft-drinks.png',
    'Tea': '/images/tea.png',
    'Yogurts': '/images/yogurt.png'
  }

  useEffect(() => {
    fetchMenu()
      .then(data => {
        setItems(data.items)
        setCategories(data.categories)
      })
      .catch(() => setError('Failed to load menu.'))
      .finally(() => setLoading(false))
  }, [])

  const featured = useMemo(() => items.filter(i => i.isFeatured), [items])

  return (
    <Box>
      {/* Hero Section */}
      <Box sx={{
        bgcolor: 'primary.main',
        color: 'white',
        py: 12,
        textAlign: 'center',
        background: 'linear-gradient(45deg, #1a237e 30%, #3949ab 90%)'
      }}>
        <Container>
          <Typography variant="h2" fontWeight={900} gutterBottom>Stories Cafe</Typography>
          <Typography variant="h5" sx={{ mb: 4, opacity: 0.9 }}>Every cup has a story. What's yours?</Typography>
          <Stack direction="row" spacing={2} justifyContent="center">
            <Button
              variant="contained"
              size="large"
              startIcon={<MenuBook />}
              onClick={() => navigate('/menu')}
              sx={{ bgcolor: 'white', color: 'primary.main', px: 4, '&:hover': { bgcolor: 'grey.100' } }}
            >
              View Menu
            </Button>
            <Button variant="outlined" size="large" color="inherit" onClick={() => navigate('/login')} sx={{ px: 4 }}>
              Sign In
            </Button>
          </Stack>
        </Container>
      </Box>

      {/* Main Sections */}
      <Container sx={{ py: 8 }}>
        {/* Categories Section */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" fontWeight={800} gutterBottom>Categories</Typography>
          {loading ? (
            <CategoryChipsSkeleton />
          ) : (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              {categories.map(cat => (
                <Grid item key={cat}>
                  <Button
                    variant="outlined"
                    onClick={() => navigate(`/menu?category=${encodeURIComponent(cat)}`)}
                    sx={{
                      borderRadius: 10,
                      px: 3,
                      py: 1,
                      textTransform: 'none',
                      display: 'flex',
                      gap: 1
                    }}
                  >
                    <Box component="img" src={categoryImages[cat]} sx={{ width: 24, height: 24 }} />
                    <Typography variant="body2" fontWeight={700}>{cat}</Typography>
                  </Button>
                </Grid>
              ))}
            </Grid>
          )}
        </Box>

        {/* Featured Items */}
        <Box sx={{ mb: 8 }}>
          <Typography variant="h4" fontWeight={800} gutterBottom>Featured Items</Typography>
          {loading ? (
            <MenuSkeleton />
          ) : (
            <FeaturedItems items={featured} />
          )}
        </Box>

        {/* Brand Mission */}
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center">
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={800} gutterBottom>Traditional Taste, Modern Experience</Typography>
            <Typography variant="body1" paragraph color="text.secondary">
              Welcome to Stories Cafe, where we blend the finest Lebanese coffee traditions with a modern atmosphere.
              Enjoy our specialty coffee, fresh pastries, and warm hospitality.
            </Typography>
            <Button variant="text" color="primary" onClick={() => navigate('/menu')} sx={{ fontWeight: 700 }}>
              Order Now →
            </Button>
          </Box>
          <Box sx={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
            <Coffee sx={{ fontSize: 200, color: 'primary.main', opacity: 0.2 }} />
          </Box>
        </Stack>
      </Container>
    </Box>
  )
}
