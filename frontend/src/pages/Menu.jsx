import { useEffect, useState, useMemo } from 'react'
import { Container, Typography, Grid, Card, CardContent, CardMedia, CardActionArea, Box, Chip, Skeleton, Button, Stack } from '@mui/material'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchMenu } from '../API/menuApi'
import { formatLL } from '../data/variantCatalog'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'

export default function Menu() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const categoryParam = params.get('category')

  const [menu, setMenu] = useState({ items: [], categories: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    setLoading(true)
    fetchMenu()
      .then(setMenu)
      .catch(() => setError('Failed to load menu'))
      .finally(() => setLoading(false))
  }, [])

  const filteredCategories = useMemo(() => {
    if (!categoryParam) return menu.categories
    return menu.categories.filter(c => c.toLowerCase() === categoryParam.toLowerCase())
  }, [menu.categories, categoryParam])

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <CategoryChipsSkeleton />
        <MenuSkeleton />
      </Container>
    )
  }

  return (
    <Container sx={{ py: 4 }}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ mb: 4 }}>
        <Typography variant="h3" fontWeight={900}>Our Menu</Typography>
        {categoryParam && (
          <Button variant="text" onClick={() => setParams({})}>Show All</Button>
        )}
      </Stack>

      {/* Category Filter Chips */}
      <Box sx={{ mb: 4, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        {menu.categories.map(cat => (
          <Chip
            key={cat}
            label={cat}
            clickable
            color={categoryParam === cat ? 'primary' : 'default'}
            onClick={() => setParams({ category: cat })}
            sx={{ fontWeight: 700 }}
          />
        ))}
      </Box>

      {filteredCategories.map(cat => (
        <Box key={cat} sx={{ mb: 6 }}>
          <Typography variant="h5" fontWeight={800} gutterBottom sx={{ textTransform: 'capitalize', color: 'primary.main' }}>
            {cat}
          </Typography>
          <Grid container spacing={3}>
            {menu.items.filter(i => i.category === cat).map(item => (
              <Grid item xs={12} sm={6} md={3} key={item.id}>
                <Card variant="outlined" sx={{ borderRadius: 2, height: '100%' }}>
                  <CardActionArea onClick={() => navigate(`/item/${item.id}`)} sx={{ height: '100%' }}>
                    <CardMedia
                      component="img"
                      height="180"
                      image={item.image}
                      alt={item.name}
                      sx={{ objectFit: 'cover' }}
                    />
                    <CardContent>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', mb: 1 }}>
                        <Typography variant="h6" fontWeight={700} sx={{ lineHeight: 1.2 }}>{item.name}</Typography>
                        <Chip label={formatLL(item.price)} size="small" color="primary" sx={{ fontWeight: 700 }} />
                      </Box>
                      <Typography variant="body2" color="text.secondary" sx={{
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrientation: 'vertical',
                        overflow: 'hidden'
                      }}>
                        {item.description}
                      </Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      ))}
    </Container>
  )
}
