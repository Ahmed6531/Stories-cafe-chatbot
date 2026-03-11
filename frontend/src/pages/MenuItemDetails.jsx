import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
import { formatLL } from '../data/variantCatalog'
import { useCart } from '../state/useCart'

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  Container,
  Divider,
  FormControl,
  InputLabel,
  List,
  ListItemText,
  MenuItem as MuiMenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material'

const brand = {
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
}

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

const optionHeadingSx = {
  mb: 0.75,
  fontSize: { xs: '0.95rem', md: '1.05rem' },
  lineHeight: 1.15,
  fontFamily: brand.fontDisplay,
}

const optionMetaSx = {
  mb: 1,
  display: 'block',
  fontSize: { xs: '0.72rem', md: '0.75rem' },
  fontFamily: brand.fontBase,
}

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [imageError, setImageError] = useState(false)

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

  useEffect(() => {
    setImageError(false)
  }, [item?.id])

  const groups = useMemo(() => {
    if (!item?.variants || item.variants.length === 0) return []
    return item.variants.map((v) => ({
      ...v,
      id: v.id || v.groupId,
      options: Array.isArray(v.options) ? v.options : [],
    }))
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

  const getFirstGroupMatching = (pred) => groups.find(pred)
  const sizeGroup = getFirstGroupMatching(
    (g) => g.id.includes('size') || g.name?.toLowerCase().includes('size')
  )
  const espressoGroup = getFirstGroupMatching(
    (g) => g.id.includes('espresso') || g.name?.toLowerCase().includes('espresso')
  )
  const milkGroup = getFirstGroupMatching(
    (g) => g.id.includes('milk') || g.name?.toLowerCase().includes('milk')
  )
  const addonsGroup = getFirstGroupMatching(
    (g) => g.id.includes('add-ons') || g.name?.toLowerCase().includes('add-ons')
  )
  const breadGroup = getFirstGroupMatching(
    (g) => g.id.includes('bread') || g.name?.toLowerCase().includes('bread')
  )
  const ingredientsGroup = getFirstGroupMatching(
    (g) => g.id.includes('ingredients') || g.name?.toLowerCase().includes('ingredients')
  )
  const toppingsGroup = getFirstGroupMatching(
    (g) => g.id.includes('toppings') || g.name?.toLowerCase().includes('toppings')
  )
  const extrasGroup = getFirstGroupMatching(
    (g) => g.id.includes('extras') || g.name?.toLowerCase().includes('extras')
  )

  const renderSizePills = (group) => {
    if (!group) return null
    const value = selections[group.id]?.value || ''
    const groupError = showErrors ? errors[group.id] : null

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={optionHeadingSx}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={optionMetaSx}>
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
              <ToggleButton key={opt.name} value={opt.name} sx={{ px: 2 }}>
                <Box>
                  <Typography variant="body2" fontWeight={700}>
                    {opt.name}
                  </Typography>
                  {Number(opt.additionalPrice || 0) > 0 && (
                    <Typography variant="caption" display="block">
                      +{formatLL(opt.additionalPrice)}
                    </Typography>
                  )}
                </Box>
              </ToggleButton>
            ))}
        </ToggleButtonGroup>
        {groupError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        )}
      </Box>
    )
  }

  const renderSingleSelect = (group) => {
    if (!group) return null
    const value = selections[group.id]?.value || ''
    const groupError = showErrors ? errors[group.id] : null

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={optionHeadingSx}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={optionMetaSx}>
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
              setSelections((prev) => ({
                ...prev,
                [group.id]: { type: 'single', value: e.target.value },
              }))
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
                  {Number(opt.additionalPrice || 0) > 0
                    ? ` (+${formatLL(opt.additionalPrice)})`
                    : ''}
                </MuiMenuItem>
              ))}
          </Select>
        </FormControl>
        {groupError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        )}
      </Box>
    )
  }

  const renderMultiSelectDropdown = (group) => {
    if (!group) return null
    const current = selections[group.id]
    const selected = current?.type === 'multi' ? current.values : []
    const selectedStrings = selected.filter((v) => typeof v === 'string')
    const groupError = showErrors ? errors[group.id] : null

    const handleChange = (e) => {
      const value = e.target.value
      const max = group.maxSelections
      const next = max != null && max > 0 ? value.slice(0, max) : value
      setSelections((prev) => ({ ...prev, [group.id]: { type: 'multi', values: next } }))
    }

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={optionHeadingSx}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={optionMetaSx}>
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
            {getRenderableOptions(group).map((opt) => (
              <MuiMenuItem key={opt.name} value={opt.name} dense>
                <Checkbox
                  checked={selectedStrings.includes(opt.name)}
                  size="small"
                  sx={{ p: 0.5, mr: 1 }}
                />
                <ListItemText
                  primary={opt.name}
                  secondary={
                    Number(opt.additionalPrice || 0) > 0
                      ? `+ ${formatLL(opt.additionalPrice)}`
                      : ''
                  }
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  sx={{ m: 0 }}
                />
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>
        {groupError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        )}
      </Box>
    )
  }

  const renderToppingsChecklist = (group) => {
    if (!group) return null
    const current = selections[group.id]
    const values = current?.type === 'multi' ? current.values : []
    const groupError = showErrors ? errors[group.id] : null

    const handleToggle = (optName) => {
      const idx = values.indexOf(optName)
      const next = [...values]
      if (idx >= 0) next.splice(idx, 1)
      else next.push(optName)
      setSelections((prev) => ({ ...prev, [group.id]: { type: 'multi', values: next } }))
    }

    return (
      <Box>
        <Typography variant="h6" fontWeight={800} sx={optionHeadingSx}>
          {group.name}
        </Typography>
        {groupMetaText(group) && (
          <Typography variant="caption" color="text.secondary" sx={optionMetaSx}>
            {groupMetaText(group)}
          </Typography>
        )}
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <List disablePadding>
            {getRenderableOptions(group).map((opt) => (
              <MuiMenuItem key={opt.name} onClick={() => handleToggle(opt.name)} dense>
                <Checkbox
                  checked={values.includes(opt.name)}
                  size="small"
                  sx={{ p: 0.5, mr: 1 }}
                />
                <ListItemText
                  primary={opt.name}
                  secondary={
                    Number(opt.additionalPrice || 0) > 0
                      ? `+ ${formatLL(opt.additionalPrice)}`
                      : ''
                  }
                  primaryTypographyProps={{ variant: 'body2' }}
                />
              </MuiMenuItem>
            ))}
          </List>
        </Card>
        {groupError && (
          <Alert severity="error" sx={{ mt: 1 }}>
            {groupError}
          </Alert>
        )}
      </Box>
    )
  }

  const handleSubmit = async () => {
    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setShowErrors(true)
      return
    }

    const selectedOptionsArray = []
    for (const gid in selections) {
      const s = selections[gid]
      if (s.type === 'single') {
        if (s.value) selectedOptionsArray.push(s.value)
      } else if (s.type === 'multi' && Array.isArray(s.values)) {
        s.values.forEach((v) => {
          if (typeof v === 'string') selectedOptionsArray.push(v)
          else if (v && typeof v === 'object' && v.name) selectedOptionsArray.push(v.name)
        })
      }
    }

    const payload = {
      menuItemId: item.mongoId || item.id,
      qty,
      selectedOptions: selectedOptionsArray,
      instructions: instructions.trim(),
    }

    try {
      console.log('Adding to cart:', payload)
      await addToCart(payload)
      setSnackOpen(true)
      setTimeout(() => navigate('/cart'), 500)
    } catch (err) {
      console.error('Failed to add to cart:', err)
      alert('Failed to add to cart. Please try again.')
    }
  }

  if (loading)
    return (
      <Container sx={{ py: 3, '& .MuiTypography-root': { fontFamily: brand.fontBase } }}>
        <Typography>Loading...</Typography>
      </Container>
    )

  if (!item)
    return (
      <Container
        sx={{
          py: 3,
          '& .MuiTypography-root': { fontFamily: brand.fontBase },
          '& .MuiButton-root': { fontFamily: brand.fontBase },
        }}
      >
        <Typography>Item not found</Typography>
        <Button onClick={() => navigate('/menu')}>Back</Button>
      </Container>
    )

  const isSandwich = item.category === 'Sandwiches'
  const showPlaceholder = !item.image || imageError

  return (
    <Container
      sx={{
        py: { xs: 1.5, md: 3 },
        px: { xs: 1.5, md: 2 },
        '& .MuiTypography-root': { fontFamily: brand.fontBase },
        '& .MuiButton-root': { fontFamily: brand.fontBase },
        '& .MuiInputBase-input': { fontFamily: brand.fontBase },
        '& .MuiInputBase-root': { fontFamily: brand.fontBase },
        '& .MuiInputLabel-root': { fontFamily: brand.fontBase },
        '& .MuiFormLabel-root': { fontFamily: brand.fontBase },
        '& .MuiFormControlLabel-label': { fontFamily: brand.fontBase },
        '& .MuiMenuItem-root': { fontFamily: brand.fontBase },
        '& .MuiChip-root': { fontFamily: brand.fontBase },
        '& .MuiAlert-message': { fontFamily: brand.fontBase },
      }}
    >
      <Button
        onClick={() => navigate('/menu')}
        sx={{
          mb: 1.5,
          px: 0,
          minWidth: 0,
          textTransform: 'none',
          fontSize: { xs: '0.8rem', md: '0.9rem' },
          fontFamily: brand.fontBase,
          justifyContent: 'flex-start',
        }}
      >
        {'<- Back to Menu'}
      </Button>

      <Box
        sx={{
          display: { xs: 'block', md: 'none' },
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 3,
          overflow: 'hidden',
          mb: 3,
          border: '1px solid rgba(0, 112, 74, 0.32)',
        }}
      >
        <Box
          sx={{
            bgcolor: '#fff',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            px: 2,
            pt: { xs: 1, md: 2.5 },
            pb: { xs: 0.5, md: 2 },
          }}
        >
          <Box
            sx={{
              width: { xs: 108, md: 140 },
              height: { xs: 108, md: 140 },
              display: 'grid',
              placeItems: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            {showPlaceholder ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#b0b8be',
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </Box>
            ) : (
              <img
                src={item.image}
                alt={item.name}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                onError={() => setImageError(true)}
              />
            )}
          </Box>
        </Box>

        <Box sx={{ px: { xs: 1.5, md: 2.5 }, pt: { xs: 1, md: 0 }, pb: { xs: 1.25, md: 2.5 } }}>
          <Typography
            sx={{
              fontFamily: brand.fontDisplay,
              fontWeight: 900,
              fontSize: { xs: '1.05rem', md: '1.6rem' },
              lineHeight: 1.05,
              mb: { xs: 0.4, md: 0.75 },
            }}
          >
            {item.name}
          </Typography>
            {item.description && (
              <Typography
                sx={{
                  fontFamily: brand.fontBase,
                  fontSize: { xs: '0.74rem', md: '0.92rem' },
                  lineHeight: { xs: 1.35, md: 1.45 },
                  opacity: 0.95,
                mb: { xs: 0.75, md: 1.25 },
                display: '-webkit-box',
                WebkitLineClamp: { xs: 4, md: 'unset' },
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
              {item.description}
            </Typography>
          )}
          <Typography
            sx={{
              fontWeight: 900,
              fontSize: { xs: '1.15rem', md: '1.9rem' },
              lineHeight: 1,
              mb: { xs: 0.75, md: 1.25 },
            }}
          >
            {formatLL(unitPrice)}
          </Typography>

          <Stack direction="row" spacing={0.75} alignItems="center" sx={{ justifyContent: 'flex-start' }}>
            <Button
              variant="contained"
              onClick={() => setQty((q) => clamp(q - 1, 1, 99))}
              sx={{
                minWidth: { xs: 28, md: 36 },
                width: { xs: 28, md: 36 },
                height: { xs: 28, md: 36 },
                p: 0,
                borderRadius: { xs: '8px', md: '10px' },
                fontSize: { xs: '0.9rem', md: '1rem' },
                bgcolor: '#176946',
                '&:hover': { bgcolor: '#125438' },
              }}
            >
              -
            </Button>
            <Typography
              sx={{
                minWidth: { xs: 16, md: 24 },
                textAlign: 'center',
                fontWeight: 800,
                fontSize: { xs: '0.9rem', md: '1rem' },
              }}
            >
              {qty}
            </Typography>
            <Button
              variant="contained"
              onClick={() => setQty((q) => clamp(q + 1, 1, 99))}
              sx={{
                minWidth: { xs: 28, md: 36 },
                width: { xs: 28, md: 36 },
                height: { xs: 28, md: 36 },
                p: 0,
                borderRadius: { xs: '8px', md: '10px' },
                fontSize: { xs: '0.9rem', md: '1rem' },
                bgcolor: '#176946',
                '&:hover': { bgcolor: '#125438' },
              }}
            >
              +
            </Button>
          </Stack>
        </Box>
      </Box>

      <Box
        sx={{
          display: { xs: 'none', md: 'block' },
          bgcolor: 'primary.main',
          color: 'primary.contrastText',
          borderRadius: 2,
          p: 2,
          mb: 3,
        }}
      >
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
            {showPlaceholder ? (
              <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#b0b8be',
                }}
              >
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <path d="m21 15-5-5L5 21" />
                </svg>
              </Box>
            ) : (
              <img
                src={item.image}
                alt={item.name}
                style={{ width: '75%', height: '75%', objectFit: 'contain' }}
                onError={() => setImageError(true)}
              />
            )}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={900} sx={{ fontFamily: brand.fontDisplay }}>
              {item.name}
            </Typography>
            {item.description && (
              <Typography variant="body2" sx={{ opacity: 0.9, fontFamily: brand.fontBase }}>
                {item.description}
              </Typography>
            )}
            <Typography variant="h6" fontWeight={900} sx={{ mt: 1, fontFamily: brand.fontBase }}>
              {formatLL(unitPrice)}
            </Typography>
          </Box>
          <Stack direction="row" spacing={1} alignItems="center">
            <Button
              variant="contained"
              onClick={() => setQty((q) => clamp(q - 1, 1, 99))}
              sx={{ minWidth: 40 }}
            >
              -
            </Button>
            <Typography fontWeight={900} sx={{ minWidth: 24, textAlign: 'center' }}>
              {qty}
            </Typography>
            <Button
              variant="contained"
              onClick={() => setQty((q) => clamp(q + 1, 1, 99))}
              sx={{ minWidth: 40 }}
            >
              +
            </Button>
          </Stack>
        </Stack>
      </Box>

      {!item.isAvailable && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Currently unavailable
        </Alert>
      )}

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={{ xs: 2, sm: 3 }}>
            {!isSandwich ? (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 3 }}>
                  <Box sx={{ flex: 1 }}>{renderSizePills(sizeGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderSingleSelect(espressoGroup)}</Box>
                  <Box sx={{ flex: 1 }}>{renderSingleSelect(milkGroup)}</Box>
                </Stack>
                <Box sx={{ maxWidth: 520 }}>{renderMultiSelectDropdown(addonsGroup)}</Box>
              </>
            ) : (
              <>
                <Stack direction={{ xs: 'column', md: 'row' }} spacing={{ xs: 2, md: 3 }}>
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
              minRows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 250))}
              helperText={`${instructions.length}/250`}
            />

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              justifyContent="space-between"
              spacing={1.25}
              alignItems={{ sm: 'center' }}
            >
              <Typography
                variant="h6"
                fontWeight={900}
                sx={{ fontSize: { xs: '0.98rem', md: '1.15rem' }, fontFamily: brand.fontDisplay }}
              >
                Total: {formatLL(totalPrice)}
              </Typography>
              <Button
                variant="contained"
                size="large"
                onClick={handleSubmit}
                disabled={!item.isAvailable}
                sx={{
                  borderRadius: 2,
                  px: 2.5,
                  py: 1,
                  fontSize: { xs: '0.88rem', md: '1rem' },
                }}
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
        message="Item added to cart"
      />
    </Container>
  )
}
