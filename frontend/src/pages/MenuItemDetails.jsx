import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
import { useCart } from '../state/useCart'
import { formatLL } from '../data/variantCatalog'

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Divider,
  FormControl,
  InputLabel,
  MenuItem as MuiMenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  Chip,
} from '@mui/material'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [instructions, setInstructions] = useState('')
  const [selectedOption, setSelectedOption] = useState('')
  const [snackOpen, setSnackOpen] = useState(false)
  const [showErrors, setShowErrors] = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true)
        const data = await fetchMenuItemById(id)
        setItem(data)
      } catch (e) {
        console.error(e)
        setItem(null)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [id])

  const unitPrice = useMemo(() => {
    if (!item) return 0
    const option = (item.options || []).find(o => o.label === selectedOption)
    return item.basePrice + (option ? Number(option.priceDelta || 0) : 0)
  }, [item, selectedOption])

  const totalPrice = unitPrice * qty

  const handleSubmit = async () => {
    if (item?.options?.length > 0 && !selectedOption) {
      setShowErrors(true)
      return
    }

    const payload = {
      menuItemId: item.mongoId,
      qty,
      selectedOptions: selectedOption ? [selectedOption] : [],
      instructions: instructions.trim(),
    }

    try {
      await addToCart(payload)
      setSnackOpen(true)
    } catch (err) {
      console.error(err)
      alert('Failed to add to cart')
    }
  }

  if (loading) return <Container sx={{ py: 3 }}><Typography>Loading item...</Typography></Container>
  if (!item) return <Container sx={{ py: 3 }}><Typography>Item not found</Typography></Container>

  return (
    <Container sx={{ py: 3 }}>
      <Button onClick={() => navigate('/menu')} sx={{ mb: 2 }}>← Back to Menu</Button>

      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2, p: { xs: 2, md: 4 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center">
          <Box sx={{ width: 200, height: 200, borderRadius: 4, bgcolor: 'background.paper', overflow: 'hidden', flexShrink: 0 }}>
            <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={900}>{item.name}</Typography>
            <Typography variant="h6" sx={{ opacity: 0.8, mb: 2 }}>{item.description}</Typography>
            <Typography variant="h4" fontWeight={900}>{formatLL(unitPrice)}</Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ bgcolor: 'rgba(255,255,255,0.1)', p: 1, borderRadius: 3 }}>
            <IconButton onClick={() => setQty(q => clamp(q - 1, 1, 99))} sx={{ color: 'white' }}>
              <Typography variant="h4">−</Typography>
            </IconButton>
            <Typography variant="h5" fontWeight={900}>{qty}</Typography>
            <IconButton onClick={() => setQty(q => clamp(q + 1, 1, 99))} sx={{ color: 'white' }}>
              <Typography variant="h4">+</Typography>
            </IconButton>
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800} gutterBottom>Customization</Typography>
              <Stack spacing={4} sx={{ mt: 2 }}>
                {item.options?.length > 0 && (
                  <FormControl fullWidth error={showErrors && !selectedOption}>
                    <InputLabel>Select Option</InputLabel>
                    <Select
                      value={selectedOption}
                      label="Select Option"
                      onChange={(e) => setSelectedOption(e.target.value)}
                    >
                      {item.options.map((opt) => (
                        <MuiMenuItem key={opt.label} value={opt.label}>
                          {opt.label} {opt.priceDelta > 0 ? ` (+${formatLL(opt.priceDelta)})` : ''}
                        </MuiMenuItem>
                      ))}
                    </Select>
                    {showErrors && !selectedOption && <Alert severity="error" sx={{ mt: 1 }}>Please select an option</Alert>}
                  </FormControl>
                )}

                <TextField
                  label="Special instructions"
                  fullWidth
                  multiline
                  rows={4}
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="e.g. Extra hot, no sugar, etc."
                />
              </Stack>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={5}>
          <Card variant="outlined" sx={{ borderRadius: 2, height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardContent sx={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'center' }}>
              <Typography variant="h5" color="text.secondary" gutterBottom>Total Amount</Typography>
              <Typography variant="h3" fontWeight={900} color="primary" sx={{ mb: 4 }}>{formatLL(totalPrice)}</Typography>
              <Button
                variant="contained"
                fullWidth
                size="large"
                onClick={handleSubmit}
                sx={{ py: 2, borderRadius: 2, fontWeight: 800, fontSize: '1.2rem' }}
              >
                Add to Cart
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={snackOpen} autoHideDuration={3000} onClose={() => setSnackOpen(false)}>
        <Alert severity="success" sx={{ width: '100%' }}>Added to cart successfully!</Alert>
      </Snackbar>
    </Container>
  )
}

// Dummy IconButton for simplicity in migration
function IconButton({ children, onClick, sx }) {
  return <Box onClick={onClick} sx={{ cursor: 'pointer', display: 'flex', alignItems: 'center', ...sx }}>{children}</Box>
}
