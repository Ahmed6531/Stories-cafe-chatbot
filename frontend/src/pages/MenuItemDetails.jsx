import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
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
  Autocomplete,
  Checkbox,
  List,
  ListItem,
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
      width: 250, // Constrain width closer to input (standardizing with Stories)
    },
  },
  // Position menu under the input
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
  /* 
     SEED DATA ISSUE: Many options (add-ons, milk) are marked isActive:false in the seed.
     If we filter strictly, the list is empty. 
     Fallback: if filtering removes everything, show all options.
  */
  const active = all.filter((o) => o.isActive !== false)
  return active.length > 0 ? active : all
}



function optionPriceOf(group, selected) {
  // selected is string OR { name, sub }
  const name = typeof selected === 'string' ? selected : selected?.name
  if (!name) return 0

  const opt = (group.options || []).find((o) => o.name === name)
  if (!opt) return 0

  const base = Number(opt.additionalPrice || 0)

  if (typeof selected === 'object' && opt.suboptions?.length) {
    const sub = opt.suboptions.find((s) => s.name === selected.sub)
    return base + Number(sub?.additionalPrice || 0)
  }

  return base
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
    if (!item?.variants || item.variants.length === 0) return []
    // Ensure all variants have valid IDs and options
    return item.variants.map(v => ({
      ...v,
      id: v.id || v.groupId, // Fallback if id missing
      options: Array.isArray(v.options) ? v.options : []
    }))
  }, [item])

  useEffect(() => {
    if (!item) return
    console.log('✅ ITEM loaded:', item.name)
    console.log('📋 Variant Groups (Backend):', groups)
    groups.forEach(g => {
      if (!g.options || g.options.length === 0) {
        console.warn(`⚠️ Group "${g.name}" (id: ${g.id}) has NO options. Check seed data or isActive flags.`)
      }
    })
  }, [item, groups])


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

  // helpers to pick groups by id patterns
  const getFirstGroupMatching = (pred) => groups.find(pred)
  const sizeGroup = getFirstGroupMatching((g) => g.id.includes('size') || g.name?.toLowerCase().includes('size'))
  const espressoGroup = getFirstGroupMatching((g) => g.id.includes('espresso') || g.name?.toLowerCase().includes('espresso'))
  const milkGroup = getFirstGroupMatching((g) => g.id.includes('milk') || g.name?.toLowerCase().includes('milk'))
  const addonsGroup = getFirstGroupMatching((g) => g.id.includes('add-ons') || g.name?.toLowerCase().includes('add-ons'))
  const breadGroup = getFirstGroupMatching((g) => g.id.includes('bread') || g.name?.toLowerCase().includes('bread'))
  const ingredientsGroup = getFirstGroupMatching((g) => g.id.includes('ingredients') || g.name?.toLowerCase().includes('ingredients'))
  const toppingsGroup = getFirstGroupMatching((g) => g.id.includes('toppings') || g.name?.toLowerCase().includes('toppings'))
  const extrasGroup = getFirstGroupMatching((g) => g.id.includes('extras') || g.name?.toLowerCase().includes('extras'))

  const renderSizePills = (group) => {
    if (!group) return null
    const value = selections[group.id]?.value || ''
    const groupError = showErrors ? errors[group.id] : null

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {groupMetaText(group)}
          </Typography>
        )}

        <ToggleButtonGroup
          value={value}
          exclusive
          onChange={(_, v) => {
            if (!v) return
            setSelections((prev) => ({ ...prev, [group.id]: { type: 'single', value: v } }))
          }}
        >
          {getRenderableOptions(group)
            .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
            .map((opt) => (
              <MuiMenuItem key={opt.name} value={opt.name}>
                {opt.name}
                {Number(opt.additionalPrice || 0) > 0 ? ` (+${formatLL(opt.additionalPrice)})` : ''}
              </MuiMenuItem>
            ))}

        </ToggleButtonGroup>

        {groupError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        ) : null}
      </Box>
    )
  }

  const renderSingleSelect = (group) => {
    if (!group) return null
    const value = selections[group.id]?.value || ''
    const groupError = showErrors ? errors[group.id] : null

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {groupMetaText(group)}
          </Typography>
        )}
        <FormControl fullWidth size="small">
          <InputLabel id={`${group.id}-label`}>{group.name}</InputLabel>
          <Select
            labelId={`${group.id}-label`}
            label={group.name}
            value={value}
            onChange={(e) =>
              setSelections((prev) => ({ ...prev, [group.id]: { type: 'single', value: e.target.value } }))
            }
          >
            <MuiMenuItem value="" disabled={group.isRequired}>
              <em>None</em>
            </MuiMenuItem>
            {getRenderableOptions(group)
              .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
              .map((opt) => (
                <MuiMenuItem key={opt.name} value={opt.name}>
                  {opt.name}
                  {Number(opt.additionalPrice || 0) > 0 ? ` (+${formatLL(opt.additionalPrice)})` : ''}
                </MuiMenuItem>
              ))}
          </Select>
        </FormControl>

        {groupError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        ) : null}
      </Box>
    )
  }

  const renderMultiSelectDropdown = (group) => {
    if (!group) return null
    const current = selections[group.id]
    const selected = current?.type === 'multi' ? current.values : []
    const selectedStrings = selected.filter((v) => typeof v === 'string')
    const groupError = showErrors ? errors[group.id] : null

    const options = group.options
      // .filter((o) => o.isActive !== false) // Removed: Add-ons in seed are false by default but should be visible
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))

    const handleChange = (e) => {
      const value = e.target.value // array of strings
      const max = group.maxSelections
      const next = max != null && max > 0 ? value.slice(0, max) : value
      setSelections((prev) => ({ ...prev, [group.id]: { type: 'multi', values: next } }))
    }

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {groupMetaText(group)}
          </Typography>
        )}

        <FormControl fullWidth size="small">
          <InputLabel id={`${group.id}-multi-label`}>{group.name}</InputLabel>
          <Select
            labelId={`${group.id}-multi-label`}
            multiple
            value={selectedStrings}
            label={group.name}
            onChange={handleChange}
            MenuProps={MenuProps}
            renderValue={(selectedArr) => (
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {selectedArr.map((v) => (
                  <Chip key={v} label={v} size="small" />
                ))}
              </Box>
            )}
          >
            {options.map((opt) => (
              <MuiMenuItem key={opt.name} value={opt.name} dense>
                <Checkbox checked={selectedStrings.includes(opt.name)} size="small" sx={{ p: 0.5, mr: 1 }} />
                <ListItemText
                  primary={opt.name}
                  secondary={Number(opt.additionalPrice || 0) > 0 ? `+ ${formatLL(opt.additionalPrice)}` : ''}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  sx={{ m: 0 }}
                />
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>

        {groupError ? (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        ) : null}
      </Box>
    )
  }


  const handleToggleTopping = (group, option) => {
    setSelections((prev) => {
      const current = prev[group.id] || { type: 'multi', values: [] }
      const values = Array.isArray(current.values) ? [...current.values] : []
      const hasSub = Array.isArray(option.suboptions) && option.suboptions.length > 0

      const idx = values.findIndex((v) =>
        typeof v === 'string' ? v === option.name : v?.name === option.name
      )

      if (idx >= 0) values.splice(idx, 1)
      else values.push(hasSub ? { name: option.name, sub: option.suboptions[0]?.name || 'Regular' } : option.name)

      return { ...prev, [group.id]: { type: 'multi', values } }
    })
  }

  const handleSetToppingSub = (group, toppingName, subName) => {
    setSelections((prev) => {
      const current = prev[group.id]
      if (!current || current.type !== 'multi') return prev
      const values = current.values.map((v) =>
        typeof v === 'object' && v?.name === toppingName ? { ...v, sub: subName } : v
      )
      return { ...prev, [group.id]: { type: 'multi', values } }
    })
  }

  const renderToppingsChecklist = (group) => {
    if (!group) return null
    const current = selections[group.id]
    const values = current?.type === 'multi' ? current.values : []

    const isChecked = (name) =>
      values.some((v) => (typeof v === 'string' ? v === name : v?.name === name))
    const selectedObj = (name) => values.find((v) => typeof v === 'object' && v?.name === name)

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={{ mb: 1 }}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={{ mb: 1, display: 'block' }}>
            {groupMetaText(group)}
          </Typography>
        )}

        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <List disablePadding>
            {getRenderableOptions(group)
              .sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
              .map((opt) => (
                <MuiMenuItem key={opt.name} value={opt.name}>
                  {opt.name}
                  {Number(opt.additionalPrice || 0) > 0 ? ` (+${formatLL(opt.additionalPrice)})` : ''}
                </MuiMenuItem>
              ))}

          </List>
        </Card>
      </Box>
    )
  }

  const handleSubmit = () => {
    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setShowErrors(true)
      return
    }

    const configured = {
      id: item.id,
      name: item.name,
      basePrice: item.basePrice,
      unitPrice,
      qty,
      totalPrice,
      selections,
      instructions: instructions.trim(),
    }

    console.log('✅ configured item:', configured)
    setSnackOpen(true)

    // later: dispatch add-to-cart + navigate('/cart')
    // navigate('/cart')
  }

  if (loading) {
    return (
      <Container sx={{ py: 3 }}>
        <Typography variant="h5">Loading...</Typography>
      </Container>
    )
  }

  if (!item) {
    return (
      <Container sx={{ py: 3 }}>
        <Typography variant="h5">Item not found</Typography>
        <Button sx={{ mt: 2 }} onClick={() => navigate('/menu')}>
          Back to Menu
        </Button>
      </Container>
    )
  }

  const isSandwich = item.category === 'Sandwiches'

  return (
    <Container sx={{ py: 3 }}>
      <Button onClick={() => navigate('/menu')} sx={{ mb: 2 }}>
        ← Back to Menu
      </Button>

      {/* HERO (like screenshots) */}
      <Box sx={{ bgcolor: 'primary.main', color: 'primary.contrastText', borderRadius: 2, p: 2, mb: 3 }}>
        <Stack direction="row" spacing={2} alignItems="center">
          <Box
            sx={{
              width: 92,
              height: 92,
              borderRadius: '50%',
              bgcolor: 'background.paper',
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img src={item.image} alt={item.name} style={{ width: '75%', height: '75%', objectFit: 'contain' }} />
          </Box>

          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={900}>
              {item.name}
            </Typography>
            {item.description ? (
              <Typography variant="body2" sx={{ opacity: 0.9 }}>
                {item.description}
              </Typography>
            ) : null}
            <Typography variant="h6" fontWeight={900} sx={{ mt: 1 }}>
              {formatLL(unitPrice)}
            </Typography>
          </Box>

          <Stack direction="row" spacing={1} alignItems="center">
            <Button variant="contained" onClick={() => setQty((q) => clamp(q - 1, 1, 99))}>
              −
            </Button>
            <Typography fontWeight={900} sx={{ minWidth: 24, textAlign: 'center' }}>
              {qty}
            </Typography>
            <Button variant="contained" onClick={() => setQty((q) => clamp(q + 1, 1, 99))}>
              +
            </Button>
          </Stack>
        </Stack>
      </Box>

      {!item.isAvailable ? (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Currently unavailable
        </Alert>
      ) : null}

      {/* CUSTOMIZATION LAYOUT */}
      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={3}>
            {/* Coffee-like layout */}
            {!isSandwich ? (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                  <Box sx={{ flex: 1 }}>{renderSizePills(sizeGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderSingleSelect(espressoGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderSingleSelect(milkGroup)}</Box>
                </Stack>

                <Box sx={{ maxWidth: 520 }}>{renderMultiSelectDropdown(addonsGroup)}</Box>
              </>
            ) : (
              /* Sandwich layout */
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={3}>
                  <Box sx={{ flex: 1 }}>{renderSingleSelect(breadGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderMultiSelectDropdown(ingredientsGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderToppingsChecklist(toppingsGroup)}</Box>
                </Stack>

                <Box sx={{ maxWidth: 520 }}>{renderMultiSelectDropdown(extrasGroup)}</Box>
              </>
            )}

            <Divider />

            <TextField
              label="Special instructions"
              placeholder="e.g., no sugar, extra hot..."
              multiline
              minRows={3}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 250))}
              helperText={`${instructions.length}/250`}
            />

            <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" spacing={2} alignItems={{ sm: 'center' }}>
              <Typography variant="h6" fontWeight={900}>
                Total: {formatLL(totalPrice)}
              </Typography>


              <Button
                variant="contained"
                size="large"
                onClick={handleSubmit}
                disabled={!item.isAvailable}
                sx={{ borderRadius: 2, px: 4 }}
              >
                ADD TO CART
              </Button>
            </Stack>
          </Stack>
        </CardContent>
      </Card>

      <Snackbar
        open={snackOpen}
        autoHideDuration={2000}
        onClose={() => setSnackOpen(false)}
        message="Saved configuration (cart hookup later)"
      />
    </Container>
  )
}