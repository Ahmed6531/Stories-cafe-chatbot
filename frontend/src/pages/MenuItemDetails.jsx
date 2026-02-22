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
  Grid,
  IconButton as MuiIconButton
} from '@mui/material'
import { Add, Remove, ChevronLeft } from '@mui/icons-material'

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
  const [selections, setSelections] = useState({}) // { groupId: optionName }
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

  // Handle selection change for a specific group
  const handleSelectionChange = (groupId, optionName) => {
    setSelections(prev => ({
      ...prev,
      [groupId]: optionName
    }))
  }

  const unitPrice = useMemo(() => {
    if (!item) return 0
    let price = item.basePrice || 0

    // Add delta from single-level options if they exist
    if (item.options?.length > 0) {
      const opt = item.options.find(o => o.label === selections['base'])
      if (opt) price += (opt.priceDelta || 0)
    }

    // Add delta from variants if they exist
    if (item.variants?.length > 0) {
      item.variants.forEach(group => {
        const selectedOptionName = selections[group.groupId]
        const opt = group.options.find(o => o.name === selectedOptionName)
        if (opt) price += (opt.additionalPrice || 0)
      })
    }

    return price
  }, [item, selections])

  const totalPrice = unitPrice * qty

  const handleSubmit = async () => {
    // Basic validation for required variants
    if (item?.variants?.length > 0) {
      const missingRequired = item.variants.some(g => g.isRequired && !selections[g.groupId])
      if (missingRequired) {
        setShowErrors(true)
        return
      }
    }

    // Validation for old-style options
    if (item?.options?.length > 0 && !selections['base']) {
      setShowErrors(true)
      return
    }

    const allSelectedOptions = Object.values(selections).filter(Boolean)

    const payload = {
      menuItemId: item.mongoId || item.id,
      qty,
      selectedOptions: allSelectedOptions,
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
      <Button startIcon={<ChevronLeft />} onClick={() => navigate('/menu')} sx={{ mb: 2 }}>Back to Menu</Button>

      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2, p: { xs: 2, md: 4 }, mb: 3 }}>
        <Stack direction={{ xs: 'column', md: 'row' }} spacing={4} alignItems="center">
          <Box sx={{ width: 200, height: 200, borderRadius: 4, bgcolor: 'background.paper', overflow: 'hidden', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <img src={item.image} alt={item.name} style={{ width: '90%', height: '90%', objectFit: 'contain' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h4" fontWeight={900}>{item.name}</Typography>
            <Typography variant="h6" sx={{ opacity: 0.8, mb: 2 }}>{item.description}</Typography>
            <Typography variant="h4" fontWeight={900}>{formatLL(unitPrice)}</Typography>
          </Box>
          <Stack direction="row" spacing={2} alignItems="center" sx={{ bgcolor: 'rgba(255,255,255,0.2)', p: 1, borderRadius: 3 }}>
            <MuiIconButton size="large" onClick={() => setQty(q => clamp(q - 1, 1, 99))} sx={{ color: 'white' }}>
              <Remove />
            </MuiIconButton>
            <Typography variant="h5" fontWeight={900}>{qty}</Typography>
            <MuiIconButton size="large" onClick={() => setQty(q => clamp(q + 1, 1, 99))} sx={{ color: 'white' }}>
              <Add />
            </MuiIconButton>
          </Stack>
        </Stack>
      </Box>

      <Grid container spacing={4}>
        <Grid item xs={12} md={7}>
          <Card variant="outlined" sx={{ borderRadius: 2 }}>
            <CardContent>
              <Typography variant="h6" fontWeight={800} gutterBottom>Customization</Typography>
              <Stack spacing={4} sx={{ mt: 2 }}>
                {/* Old style options */}
                {item.options?.length > 0 && (
                  <FormControl fullWidth error={showErrors && !selections['base']}>
                    <InputLabel>Select Option</InputLabel>
                    <Select
                      value={selections['base'] || ''}
                      label="Select Option"
                      onChange={(e) => handleSelectionChange('base', e.target.value)}
                    >
                      {item.options.map((opt) => (
                        <MuiMenuItem key={opt.label} value={opt.label}>
                          {opt.label} {opt.priceDelta > 0 ? ` (+${formatLL(opt.priceDelta)})` : ''}
                        </MuiMenuItem>
                      ))}
                    </Select>
                  </FormControl>
                )}

                {/* New style multi-variant support */}
                {item.variants?.map((group) => (
                  <FormControl key={group.groupId} fullWidth error={showErrors && group.isRequired && !selections[group.groupId]}>
                    <InputLabel>{group.name}</InputLabel>
                    <Select
                      value={selections[group.groupId] || ''}
                      label={group.name}
                      onChange={(e) => handleSelectionChange(group.groupId, e.target.value)}
                    >
                      {group.options.map((opt) => (
                        <MuiMenuItem key={opt.name} value={opt.name}>
                          {opt.name} {opt.additionalPrice > 0 ? ` (+${formatLL(opt.additionalPrice)})` : ''}
                        </MuiMenuItem>
                      ))}
                    </Select>
                    {showErrors && group.isRequired && !selections[group.groupId] && (
                      <Typography variant="caption" color="error" sx={{ mt: 0.5 }}>This selection is required</Typography>
                    )}
                  </FormControl>
                ))}

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
                sx={{ py: 2, borderRadius: 2, fontWeight: 800, fontSize: '1.2rem', bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
              >
                Add to Cart
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      <Snackbar open={snackOpen} autoHideDuration={3000} onClose={() => setSnackOpen(false)}>
        <Alert severity="success" variant="filled" sx={{ width: '100%' }}>Added to cart successfully!</Alert>
      </Snackbar>
    </Container>
  )
}
