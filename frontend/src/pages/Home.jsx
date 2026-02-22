import { Container, Typography, Box, Button, Stack } from '@mui/material'
import { useNavigate } from 'react-router-dom'
import { Coffee, MenuBook } from '@mui/icons-material'

export default function Home() {
  const navigate = useNavigate()

  return (
    <Box>
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
              sx={{
                bgcolor: 'white',
                color: 'primary.main',
                px: 4,
                '&:hover': { bgcolor: 'grey.100' }
              }}
            >
              View Menu
            </Button>
            <Button
              variant="outlined"
              size="large"
              color="inherit"
              onClick={() => navigate('/login')}
              sx={{ px: 4, borderWidth: 2, '&:hover': { borderWidth: 2 } }}
            >
              Sign In
            </Button>
          </Stack>
        </Container>
      </Box>

      <Container sx={{ py: 8 }}>
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
