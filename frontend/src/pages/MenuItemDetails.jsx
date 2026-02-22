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
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  Checkbox,
  List,
  ListItemText,
  Chip,
} from '@mui/material'

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n))
}

const ITEM_HEIGHT = 48
const ITEM_PADDING_TOP = 8
const MenuProps = {
  PaperProps: {
    style: {
      maxHeight: ITEM_HEIGHT * 4.5 + ITEM_PADDING_TOP,
      width: 250,
    },
  },
  anchorOrigin: {
    vertical: 'bottom',
    horizontal: 'left',
  },
  transformOrigin: {
    vertical: 'top',
    horizontal: 'left',
  },
}

function initSelections(groups) {
  const next = {}
  for (const g of groups) {
    const isSingle = g.maxSelections === 1
    next[g.id] = isSingle ? { type: 'single', value: '' } : { type: 'multi', values: [] }
  }
  return next
}

function groupMetaText(group) {
  const parts = []
  if (group.isRequired) parts.push('Required')
  if (group.maxSelections && group.maxSelections > 1) {
    parts.push(`Choose up to ${group.maxSelections}`)
  }
  return parts.join(' • ')
}

function getRenderableOptions(group) {
  const all = Array.isArray(group?.options) ? group.options : []
  const active = all.filter((o) => o.isActive !== false)
  return active.length > 0 ? active : all
}

function optionPriceOf(group, selected) {
  const name = typeof selected === 'string' ? selected : selected?.name
  if (!name) return 0
  const opt = (group.options || []).find((o) => o.name === name)
  if (!opt) return 0
  return Number(opt.additionalPrice || 0)
}

function computeUnitPrice(basePrice, groups, selections) {
  let extra = 0
  for (const g of groups) {
    const sel = selections[g.id]
    if (!sel) continue
    if (sel.type === 'single') {
      extra += optionPriceOf(g, sel.value)
    } else {
      for (const v of sel.values) extra += optionPriceOf(g, v)
    }
  }
  return Number(basePrice || 0) + extra
}

function validate(groups, selections) {
  const errors = {}
  for (const g of groups) {
    const sel = selections[g.id]
    const count =
      sel?.type === 'single' ? (sel.value ? 1 : 0) : Array.isArray(sel?.values) ? sel.values.length : 0
    if (g.isRequired && count === 0) errors[g.id] = 'Required'
    if (g.maxSelections != null && g.maxSelections > 0 && count > g.maxSelections) {
      errors[g.id] = `Select up to ${g.maxSelections}`
    }
  }
  return errors
}

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [instructions, setInstructions] = useState('')
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

  const groups = useMemo(() => {
    if (!item?.options) return []
    // Treat item.options as a single variant group if they are not already grouped
    // In this project, it seems options are flat on the MenuItem
    return [{
      id: 'default',
      name: 'Options',
      options: item.options,
      maxSelections: 99
    }]
  }, [item])

  const [selections, setSelections] = useState(() => initSelections([]))
  useEffect(() => {
    setSelections(initSelections(groups))
    setQty(1)
    setInstructions('')
    setShowErrors(false)
  }, [id, groups])

  const errors = useMemo(() => validate(groups, selections), [groups, selections])
  const unitPrice = useMemo(() => {
    if (!item) return 0
    return computeUnitPrice(item.basePrice, groups, selections)
  }, [item, groups, selections])
  const totalPrice = unitPrice * qty

  const handleSubmit = async () => {
    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setShowErrors(true)
      return
    }

    const selectedOptions = []
    for (const g of groups) {
      const sel = selections[g.id]
      if (!sel) continue
      if (sel.type === 'single' && sel.value) selectedOptions.push(sel.value)
      else if (sel.type === 'multi' && sel.values.length > 0) {
        for (const v of sel.values) selectedOptions.push(typeof v === 'string' ? v : v.name)
      }
    }

    const payload = {
      menuItemId: item.mongoId,
      qty,
      selectedOptions,
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

  const renderSingleSelect = (group) => {
    if (!group) return null
    const value = selections[group.id]?.value || ''
    const groupError = showErrors ? errors[group.id] : null
    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>{group.name}</Typography>
        <FormControl fullWidth size="small">
          <InputLabel>{group.name}</InputLabel>
          <Select
            label={group.name}
            value={value}
            onChange={(e) => setSelections((prev) => ({ ...prev, [group.id]: { type: 'single', value: e.target.value } }))}
          >
            {group.options.map((opt) => (
              <MuiMenuItem key={opt.label} value={opt.label}>
                {opt.label} {opt.priceDelta > 0 ? ` (+${formatLL(opt.priceDelta)})` : ''}
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>
        {groupError && <Alert severity="error" sx={{ mt: 1 }}>{groupError}</Alert>}
      </Box>
    )
  }

  if (loading) return <Container sx={{ py: 3 }}><Typography>Loading...</Typography></Container>
  if (!item) return <Container sx={{ py: 3 }}><Typography>Item not found</Typography></Container>

  return (
    <Container sx={{ py: 3 }}>
      <Button onClick={() => navigate('/menu')} sx={{ mb: 2 }}>← Back to Menu</Button>
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2, p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box sx={{ width: 92, height: 92, borderRadius: '50%', bgcolor: 'background.paper', overflow: 'hidden' }}>
            <img src={item.image} alt={item.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={900}>{item.name}</Typography>
            <Typography variant="body2">{item.description}</Typography>
            <Typography variant="h6" fontWeight={900} sx={{ mt: 1 }}>{formatLL(unitPrice)}</Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => setQty(q => clamp(q - 1, 1, 99))}>−</Button>
            <Typography fontWeight={900}>{qty}</Typography>
            <Button variant="contained" onClick={() => setQty(q => clamp(q + 1, 1, 99))}>+</Button>
          </Stack>
        </Stack>
      </Box>

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={3}>
            {groups.map(g => renderSingleSelect(g))}
            <TextField
              label="Special instructions"
              multiline
              rows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
            />
            <Stack direction="row" justifyContent="space-between" alignItems="center">
              <Typography variant="h6" fontWeight={900}>Total: {formatLL(totalPrice)}</Typography>
              <Button variant="contained" size="large" onClick={handleSubmit}>ADD TO CART</Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>
      <Snackbar open={snackOpen} autoHideDuration={2000} onClose={() => setSnackOpen(false)} message="Added to cart!" />
    </Container>
  )
}