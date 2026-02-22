import { useEffect, useState } from 'react'
import { Container, Typography, Grid, Card, CardContent, CardMedia, CardActionArea, Box, Chip, Skeleton } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { fetchMenu } from '../API/menuApi'
import { formatLL } from '../data/variantCatalog'

export default function Menu() {
  const navigate = useNavigate()
  const [menu, setMenu] = useState({ items: [], categories: [] })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchMenu()
      .then(setMenu)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <Skeleton variant="text" width={200} height={60} sx={{ mb: 4 }} />
        <Grid container spacing={3}>
          {[1, 2, 3, 4].map(i => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rectangular" height={200} sx={{ borderRadius: 2 }} />
            </Grid>
          ))}
        </Grid>
      </Container>
    )
  }

  return (
    <Container sx={{ py: 4 }}>
      <Typography variant="h3" fontWeight={900} gutterBottom>Our Menu</Typography>

      {menu.categories.map(cat => (
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
