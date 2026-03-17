import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
import { formatLL } from '../utils/currency'
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
  useTheme,
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

function createSelectionEntry(optionName, suboptionName = '') {
  const trimmedOptionName = String(optionName || '').trim()
  if (!trimmedOptionName) return null

  const trimmedSuboptionName = String(suboptionName || '').trim()
  return trimmedSuboptionName
    ? { optionName: trimmedOptionName, suboptionName: trimmedSuboptionName }
    : { optionName: trimmedOptionName }
}

function normalizeSelectionEntry(selected) {
  if (!selected) return null
  if (typeof selected === 'string') return createSelectionEntry(selected)
  if (typeof selected !== 'object') return null

  return createSelectionEntry(
    selected.optionName || selected.name,
    selected.suboptionName || selected.sub,
  )
}

function getSelectionOptionName(selected) {
  return normalizeSelectionEntry(selected)?.optionName || ''
}

function findOptionByName(group, optionName) {
  return (group.options || []).find((option) => option.name === optionName) || null
}

function getDefaultSuboptionName(option) {
  const suboptions = Array.isArray(option?.suboptions) ? option.suboptions : []
  if (suboptions.length === 0) return ''

  const regular = suboptions.find((suboption) => String(suboption?.name).toLowerCase() === 'regular')
  return regular?.name || suboptions[0]?.name || ''
}

function createSelectionForOption(group, optionName, existingSelection = null) {
  const option = findOptionByName(group, optionName)
  if (!option) return createSelectionEntry(optionName)

  const existing = normalizeSelectionEntry(existingSelection)
  const suboptions = Array.isArray(option.suboptions) ? option.suboptions : []

  if (suboptions.length === 0) {
    return createSelectionEntry(optionName)
  }

  const preservedSuboption = suboptions.some((suboption) => suboption.name === existing?.suboptionName)
    ? existing?.suboptionName
    : getDefaultSuboptionName(option)

  return createSelectionEntry(optionName, preservedSuboption)
}

function optionPriceOf(group, selected) {
  const selection = normalizeSelectionEntry(selected)
  const optionName = selection?.optionName
  if (!optionName) return 0

  const opt = findOptionByName(group, optionName)
  if (!opt) return 0

  const base = Number(opt.additionalPrice || 0)

  if (selection?.suboptionName && opt.suboptions?.length) {
    const sub = opt.suboptions.find((s) => s.name === selection.suboptionName)
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

function sortOptions(options) {
  return [...options].sort((a, b) => (a.order ?? 999) - (b.order ?? 999))
}

function getSortedRenderableOptions(group) {
  return sortOptions(getRenderableOptions(group))
}

function formatInlineOptionPrice(additionalPrice) {
  return Number(additionalPrice || 0) > 0 ? ` (+${formatLL(additionalPrice)})` : ''
}

function formatSecondaryOptionPrice(additionalPrice) {
  return Number(additionalPrice || 0) > 0 ? `+ ${formatLL(additionalPrice)}` : ''
}

function serializeSelectedOptions(selections) {
  const selectedOptionsArray = []

  for (const gid in selections) {
    const selection = selections[gid]
    if (selection.type === 'single') {
      const normalized = normalizeSelectionEntry(selection.value)
      if (normalized) selectedOptionsArray.push(normalized)
      continue
    }

    if (selection.type === 'multi' && Array.isArray(selection.values)) {
      selection.values.forEach((value) => {
        const normalized = normalizeSelectionEntry(value)
        if (normalized) selectedOptionsArray.push(normalized)
      })
    }
  }

  return selectedOptionsArray
}

function chunkGroups(groups, size) {
  const chunks = []
  for (let i = 0; i < groups.length; i += size) {
    chunks.push(groups.slice(i, i + size))
  }
  return chunks
}

function getStableGroupKey(group) {
  return String(group?.groupId || group?.id || '').toLowerCase()
}

function shouldUsePillSelector(group, options) {
  if (group?.maxSelections !== 1) return false
  return getStableGroupKey(group).includes('size') && options.length <= 4
}

function shouldUseChecklist(group, options) {
  if (group?.maxSelections === 1) return false
  return getStableGroupKey(group).includes('topping') && options.length <= 8
}

function OptionGroupSection({ group, showErrors, errors, children }) {
  const theme = useTheme()
  if (!group) return null

  const groupError = showErrors ? errors[group.id] : null
  const metaText = groupMetaText(group)

  return (
    <Box>
      <Typography
        variant="h6"
        fontWeight={800}
        sx={{
          mb: 0.75,
          fontSize: { xs: '0.95rem', md: '1.05rem' },
          lineHeight: 1.15,
          fontFamily: theme.brand.fontDisplay,
        }}
      >
        {group.name}
      </Typography>
      {metaText && (
        <Typography
          variant="caption"
          color="text.secondary"
          sx={{
            mb: 1,
            display: 'block',
            fontSize: { xs: '0.72rem', md: '0.75rem' },
            fontFamily: theme.brand.fontBase,
          }}
        >
          {metaText}
        </Typography>
      )}
      {children}
      {groupError && (
        <Alert severity="error" sx={{ mt: 1 }}>
          {groupError}
        </Alert>
      )}
    </Box>
  )
}

function QuantitySelector({
  qty,
  onDecrease,
  onIncrease,
  buttonSx,
  countSx,
  spacing = 1,
}) {
  return (
    <Stack direction="row" spacing={spacing} alignItems="center">
      <Button variant="contained" onClick={onDecrease} sx={buttonSx}>
        -
      </Button>
      <Typography sx={countSx}>{qty}</Typography>
      <Button variant="contained" onClick={onIncrease} sx={buttonSx}>
        +
      </Button>
    </Stack>
  )
}

function ItemArtwork({ item, showPlaceholder, onImageError, imageSx }) {
  if (showPlaceholder) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#b0b8be',
          width: '100%',
          height: '100%',
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
    )
  }

  return (
    <Box
      component="img"
      src={item.image}
      alt={item.name}
      onError={onImageError}
      sx={imageSx}
    />
  )
}

function MenuItemHero({
  item,
  unitPrice,
  qty,
  onDecrease,
  onIncrease,
  showPlaceholder,
  onImageError,
}) {
  const theme = useTheme()

  return (
    <>
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
            <ItemArtwork
              item={item}
              showPlaceholder={showPlaceholder}
              onImageError={onImageError}
              imageSx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          </Box>
        </Box>

        <Box sx={{ px: { xs: 1.5, md: 2.5 }, pt: { xs: 1, md: 0 }, pb: { xs: 1.25, md: 2.5 } }}>
          <Typography
            sx={{
              fontFamily: theme.brand.fontDisplay,
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
                fontFamily: theme.brand.fontBase,
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

          <QuantitySelector
            qty={qty}
            onDecrease={onDecrease}
            onIncrease={onIncrease}
            spacing={0.75}
            buttonSx={{
              minWidth: { xs: 28, md: 36 },
              width: { xs: 28, md: 36 },
              height: { xs: 28, md: 36 },
              p: 0,
              borderRadius: { xs: '8px', md: '10px' },
              fontSize: { xs: '0.9rem', md: '1rem' },
              bgcolor: '#176946',
              '&:hover': { bgcolor: '#125438' },
            }}
            countSx={{
              minWidth: { xs: 16, md: 24 },
              textAlign: 'center',
              fontWeight: 800,
              fontSize: { xs: '0.9rem', md: '1rem' },
            }}
          />
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
            <ItemArtwork
              item={item}
              showPlaceholder={showPlaceholder}
              onImageError={onImageError}
              imageSx={{ width: '75%', height: '75%', objectFit: 'contain' }}
            />
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography variant="h5" fontWeight={900} sx={{ fontFamily: theme.brand.fontDisplay }}>
              {item.name}
            </Typography>
            {item.description && (
              <Typography variant="body2" sx={{ opacity: 0.9, fontFamily: theme.brand.fontBase }}>
                {item.description}
              </Typography>
            )}
            <Typography variant="h6" fontWeight={900} sx={{ mt: 1, fontFamily: theme.brand.fontBase }}>
              {formatLL(unitPrice)}
            </Typography>
          </Box>
          <QuantitySelector
            qty={qty}
            onDecrease={onDecrease}
            onIncrease={onIncrease}
            buttonSx={{ minWidth: 40 }}
            countSx={{ minWidth: 24, textAlign: 'center', fontWeight: 900 }}
          />
        </Stack>
      </Box>
    </>
  )
}

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const theme = useTheme()

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
  const decrementQty = () => setQty((q) => clamp(q - 1, 1, 99))
  const incrementQty = () => setQty((q) => clamp(q + 1, 1, 99))
  const groupedRows = useMemo(() => chunkGroups(groups, 3), [groups])

  const setGroupSelection = (groupId, nextSelection) => {
    setSelections((prev) => ({ ...prev, [groupId]: nextSelection }))
  }

  const renderSuboptionSelect = (group, selection, onChange, sx = { mt: 1.25 }) => {
    const normalizedSelection = normalizeSelectionEntry(selection)
    const optionName = normalizedSelection?.optionName
    if (!optionName) return null

    const option = findOptionByName(group, optionName)
    const suboptions = Array.isArray(option?.suboptions) ? option.suboptions : []
    if (suboptions.length === 0) return null

    return (
      <FormControl fullWidth size="small" sx={sx}>
        <InputLabel id={`${group.id}-${optionName}-suboption-label`}>Amount</InputLabel>
        <Select
          labelId={`${group.id}-${optionName}-suboption-label`}
          label="Amount"
          value={normalizedSelection?.suboptionName || getDefaultSuboptionName(option)}
          onChange={(event) => onChange(event.target.value)}
        >
          {suboptions.map((suboption) => (
            <MuiMenuItem key={suboption.name} value={suboption.name}>
              {suboption.name}
              {formatInlineOptionPrice(suboption.additionalPrice)}
            </MuiMenuItem>
          ))}
        </Select>
      </FormControl>
    )
  }

  const renderGroup = (group) => {
    if (!group) return null

    const options = getSortedRenderableOptions(group)
    if (shouldUsePillSelector(group, options)) {
      return renderSizePills(group, options)
    }

    if (group.maxSelections === 1) {
      return renderSingleSelect(group, options)
    }

    if (shouldUseChecklist(group, options)) {
      return renderToppingsChecklist(group, options)
    }

    return renderMultiSelectDropdown(group, options)
  }

  const renderSizePills = (group, options = getSortedRenderableOptions(group)) => {
    if (!group) return null
    const currentSelection = selections[group.id]?.value
    const value = getSelectionOptionName(currentSelection)

    return (
      <OptionGroupSection group={group} showErrors={showErrors} errors={errors}>
        <Stack spacing={1.25}>
          <ToggleButtonGroup
            value={value}
            exclusive
            onChange={(_, v) => {
              if (!v) return
              setGroupSelection(group.id, {
                type: 'single',
                value: createSelectionForOption(group, v, currentSelection),
              })
            }}
          >
            {options.map((opt) => (
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
          {renderSuboptionSelect(group, currentSelection, (suboptionName) =>
            setGroupSelection(group.id, {
              type: 'single',
              value: createSelectionEntry(value, suboptionName),
            }),
          )}
        </Stack>
      </OptionGroupSection>
    )
  }

  const renderSingleSelect = (group, options = getSortedRenderableOptions(group)) => {
    if (!group) return null
    const currentSelection = selections[group.id]?.value
    const value = getSelectionOptionName(currentSelection)

    return (
      <OptionGroupSection group={group} showErrors={showErrors} errors={errors}>
        <Stack spacing={1.25}>
          <FormControl fullWidth size="small">
            <InputLabel id={`${group.id}-label`}>{group.name}</InputLabel>
            <Select
              labelId={`${group.id}-label`}
              label={group.name}
              value={value}
              onChange={(e) =>
                setGroupSelection(group.id, {
                  type: 'single',
                  value: createSelectionForOption(group, e.target.value, currentSelection),
                })
              }
            >
              <MuiMenuItem value="" disabled={group.isRequired}>
                <em>None</em>
              </MuiMenuItem>
              {options.map((opt) => (
                <MuiMenuItem key={opt.name} value={opt.name}>
                  {opt.name}
                  {formatInlineOptionPrice(opt.additionalPrice)}
                </MuiMenuItem>
              ))}
            </Select>
          </FormControl>
          {renderSuboptionSelect(group, currentSelection, (suboptionName) =>
            setGroupSelection(group.id, {
              type: 'single',
              value: createSelectionEntry(value, suboptionName),
            }),
          )}
        </Stack>
      </OptionGroupSection>
    )
  }

  const renderMultiSelectDropdown = (group, options = getSortedRenderableOptions(group)) => {
    if (!group) return null
    const current = selections[group.id]
    const selected = current?.type === 'multi' ? current.values : []
    const selectedStrings = selected.map((value) => getSelectionOptionName(value)).filter(Boolean)

    const handleChange = (e) => {
      const value = e.target.value
      const max = group.maxSelections
      const existingByOption = new Map(
        selected
          .map((entry) => normalizeSelectionEntry(entry))
          .filter(Boolean)
          .map((entry) => [entry.optionName, entry]),
      )
      const nextNames = max != null && max > 0 ? value.slice(0, max) : value
      const next = nextNames.map((optionName) =>
        createSelectionForOption(group, optionName, existingByOption.get(optionName)),
      )
      setGroupSelection(group.id, { type: 'multi', values: next })
    }

    return (
      <OptionGroupSection group={group} showErrors={showErrors} errors={errors}>
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
                <Checkbox
                  checked={selectedStrings.includes(opt.name)}
                  size="small"
                  sx={{ p: 0.5, mr: 1 }}
                />
                <ListItemText
                  primary={opt.name}
                  secondary={formatSecondaryOptionPrice(opt.additionalPrice)}
                  primaryTypographyProps={{ variant: 'body2', fontWeight: 500 }}
                  secondaryTypographyProps={{ variant: 'caption' }}
                  sx={{ m: 0 }}
                />
              </MuiMenuItem>
            ))}
          </Select>
        </FormControl>
      </OptionGroupSection>
    )
  }

  const renderToppingsChecklist = (group, options = getSortedRenderableOptions(group)) => {
    if (!group) return null
    const current = selections[group.id]
    const values = current?.type === 'multi' ? current.values : []

    const handleToggle = (optName) => {
      const idx = values.findIndex((value) => getSelectionOptionName(value) === optName)
      const next = [...values]
      if (idx >= 0) next.splice(idx, 1)
      else next.push(createSelectionForOption(group, optName))
      setGroupSelection(group.id, { type: 'multi', values: next })
    }

    const handleSuboptionChange = (optName, suboptionName) => {
      const next = values.map((value) =>
        getSelectionOptionName(value) === optName
          ? createSelectionEntry(optName, suboptionName)
          : normalizeSelectionEntry(value),
      )
      setGroupSelection(group.id, { type: 'multi', values: next })
    }

    return (
      <OptionGroupSection group={group} showErrors={showErrors} errors={errors}>
        <Card variant="outlined" sx={{ borderRadius: 2 }}>
          <List disablePadding>
            {options.map((opt) => (
              <Box key={opt.name} sx={{ px: 1.5, py: 0.75 }}>
                <MuiMenuItem onClick={() => handleToggle(opt.name)} dense sx={{ borderRadius: 1 }}>
                  <Checkbox
                    checked={values.some((value) => getSelectionOptionName(value) === opt.name)}
                    size="small"
                    sx={{ p: 0.5, mr: 1 }}
                  />
                  <ListItemText
                    primary={opt.name}
                    secondary={formatSecondaryOptionPrice(opt.additionalPrice)}
                    primaryTypographyProps={{ variant: 'body2' }}
                  />
                </MuiMenuItem>
                {values.some((value) => getSelectionOptionName(value) === opt.name) && (
                  <Box sx={{ mt: 1, pl: 4.5 }}>
                    {renderSuboptionSelect(
                      group,
                      values.find((value) => getSelectionOptionName(value) === opt.name),
                      (suboptionName) => handleSuboptionChange(opt.name, suboptionName),
                      {},
                    )}
                  </Box>
                )}
              </Box>
            ))}
          </List>
        </Card>
      </OptionGroupSection>
    )
  }

  const handleSubmit = async () => {
    const hasErrors = Object.keys(errors).length > 0
    if (hasErrors) {
      setShowErrors(true)
      return
    }

    const payload = {
      menuItemId: item.mongoId || item.id,
      qty,
      selectedOptions: serializeSelectedOptions(selections),
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
      <Container sx={{ py: 3, '& .MuiTypography-root': { fontFamily: theme.brand.fontBase } }}>
        <Typography>Loading...</Typography>
      </Container>
    )

  if (!item)
    return (
      <Container
        sx={{
          py: 3,
          '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
          '& .MuiButton-root': { fontFamily: theme.brand.fontBase },
        }}
      >
        <Typography>Item not found</Typography>
        <Button onClick={() => navigate('/menu')}>Back</Button>
      </Container>
    )

  const showPlaceholder = !item.image || imageError

  return (
    <Container
      sx={{
        py: { xs: 1.5, md: 3 },
        px: { xs: 1.5, md: 2 },
        '& .MuiTypography-root': { fontFamily: theme.brand.fontBase },
        '& .MuiButton-root': { fontFamily: theme.brand.fontBase },
        '& .MuiInputBase-input': { fontFamily: theme.brand.fontBase },
        '& .MuiInputBase-root': { fontFamily: theme.brand.fontBase },
        '& .MuiInputLabel-root': { fontFamily: theme.brand.fontBase },
        '& .MuiFormLabel-root': { fontFamily: theme.brand.fontBase },
        '& .MuiFormControlLabel-label': { fontFamily: theme.brand.fontBase },
        '& .MuiMenuItem-root': { fontFamily: theme.brand.fontBase },
        '& .MuiChip-root': { fontFamily: theme.brand.fontBase },
        '& .MuiAlert-message': { fontFamily: theme.brand.fontBase },
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
          fontFamily: theme.brand.fontBase,
          justifyContent: 'flex-start',
        }}
      >
        {'<- Back to Menu'}
      </Button>

      <MenuItemHero
        item={item}
        unitPrice={unitPrice}
        qty={qty}
        onDecrease={decrementQty}
        onIncrease={incrementQty}
        showPlaceholder={showPlaceholder}
        onImageError={() => setImageError(true)}
      />

      {!item.isAvailable && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          Currently unavailable
        </Alert>
      )}

      <Card sx={{ borderRadius: 2 }}>
        <CardContent>
          <Stack spacing={{ xs: 2, sm: 3 }}>
            {groupedRows.map((row, rowIndex) => (
              <Stack
                key={row.map((group) => group.id).join('-') || rowIndex}
                direction={{ xs: 'column', md: 'row' }}
                spacing={{ xs: 2, md: 3 }}
              >
                {row.map((group) => (
                  <Box key={group.id} sx={{ flex: 1 }}>
                    {renderGroup(group)}
                  </Box>
                ))}
              </Stack>
            ))}

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
                sx={{ fontSize: { xs: '0.98rem', md: '1.15rem' }, fontFamily: theme.brand.fontDisplay }}
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
