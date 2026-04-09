import { useEffect, useState } from "react"
import { fetchMenu, createMenuItem, updateMenuItem, deleteMenuItem } from "../../API/menuApi"
import { styled } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import { invalidateCategoriesCache } from '../../API/menuApi';

// ── Styled components ──────────────────────────────────────────────────────────

const PageWrap = styled(Box)(() => ({
  display: 'flex',
  flexDirection: 'column',
  gap: 28,
}))

const FormCard = styled(Box)(({ theme }) => ({
  maxWidth: 560,
  display: 'flex',
  flexDirection: 'column',
  gap: 12,
  padding: '24px',
  borderRadius: 16,
  border: `1px solid ${theme.brand.borderCard}`,
  background: theme.brand.bgLight,
}))

const FieldInput = styled('input')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  background: '#fff',
  border: `1px solid ${theme.brand.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  transition: 'border-color 0.2s',
  '&:focus': { borderColor: theme.brand.primary },
  '&::placeholder': { color: theme.brand.radioInactive },
}))

const FieldTextarea = styled('textarea')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  background: '#fff',
  border: `1px solid ${theme.brand.border}`,
  borderRadius: 10,
  padding: '10px 12px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  resize: 'vertical',
  transition: 'border-color 0.2s',
  '&:focus': { borderColor: theme.brand.primary },
  '&::placeholder': { color: theme.brand.radioInactive },
}))

const CheckRow = styled('label')(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
  fontWeight: 500,
  color: theme.brand.textPrimary,
  cursor: 'pointer',
  userSelect: 'none',
}))

const BtnRow = styled(Box)(() => ({
  display: 'flex',
  gap: 10,
  marginTop: 4,
}))

const PrimaryBtn = styled('button')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 700,
  fontSize: 14,
  padding: '10px 20px',
  borderRadius: 10,
  border: 'none',
  background: theme.brand.primary,
  color: '#fff',
  cursor: 'pointer',
  transition: 'background 0.2s',
  '&:hover:not(:disabled)': { background: theme.brand.primaryHover },
  '&:disabled': { opacity: 0.6, cursor: 'not-allowed' },
}))

const GhostBtn = styled('button')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  fontSize: 14,
  padding: '10px 16px',
  borderRadius: 10,
  border: `1.5px solid ${theme.brand.border}`,
  background: '#fff',
  color: theme.brand.textPrimary,
  cursor: 'pointer',
  transition: 'border-color 0.2s, color 0.2s',
  '&:hover': { borderColor: theme.brand.primary, color: theme.brand.primary },
}))

const DangerBtn = styled('button')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: '1.5px solid #fca5a5',
  background: '#fff',
  color: '#dc2626',
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
  '&:hover': { background: '#fef2f2', borderColor: '#dc2626' },
}))

const EditBtn = styled('button')(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontWeight: 600,
  fontSize: 13,
  padding: '6px 12px',
  borderRadius: 8,
  border: `1.5px solid ${theme.brand.border}`,
  background: '#fff',
  color: theme.brand.primary,
  cursor: 'pointer',
  transition: 'background 0.2s, border-color 0.2s',
  '&:hover': { background: 'rgba(0,112,74,0.06)', borderColor: theme.brand.primary },
}))

const StyledTable = styled('table')(({ theme }) => ({
  width: '100%',
  borderCollapse: 'collapse',
  fontFamily: theme.brand.fontBase,
  fontSize: 14,
}))

const Th = styled('th')(({ theme }) => ({
  textAlign: 'left',
  padding: '10px 14px',
  fontWeight: 700,
  fontSize: 13,
  color: theme.brand.textSecondary,
  borderBottom: `2px solid ${theme.brand.borderCard}`,
  whiteSpace: 'nowrap',
}))

const Td = styled('td')(({ theme }) => ({
  padding: '10px 14px',
  borderBottom: `1px solid ${theme.brand.borderLight}`,
  color: theme.brand.textPrimary,
  verticalAlign: 'middle',
}))

const ErrorMsg = styled(Typography)(({ theme }) => ({
  fontFamily: theme.brand.fontBase,
  fontSize: 13,
  fontWeight: 500,
  color: theme.brand.error,
  padding: '8px 12px',
  background: '#fff5f5',
  borderRadius: 8,
  border: '1px solid #fecaca',
}))

// ── Component ──────────────────────────────────────────────────────────────────

const EMPTY_FORM = {
  name: '',
  category: '',
  basePrice: '',
  description: '',
  isAvailable: true,
  slug: '',
  image: '',
}

export default function AdminItems() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [formError, setFormError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const data = await fetchMenu()
        setItems(data.items)
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function onFormChange(e) {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  function validateForm() {
    if (!form.name.trim()) return 'Name is required'
    if (!form.category.trim()) return 'Category is required'
    if (!form.slug.trim()) return 'Slug is required'
    if (!form.image.trim()) return 'Image URL is required'
    const priceNum = Number(form.basePrice)
    if (Number.isNaN(priceNum) || priceNum < 0) return 'Base price must be a number ≥ 0'
    return ''
  }

  async function onSubmit(e) {
    e.preventDefault()
    const msg = validateForm()
    if (msg) { setFormError(msg); return }

    const payload = { ...form, basePrice: Number(form.basePrice) }
    setSaving(true)
    try {
      if (editingId) {
        await updateMenuItem(editingId, payload)
      } else {
        await createMenuItem(payload)
      }

      invalidateCategoriesCache()

      const data = await fetchMenu()
      setItems(data.items)
      setForm(EMPTY_FORM)
      setEditingId(null)
      setFormError('')
    } catch (err) {
      setFormError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this item?')) return
    try {
      await deleteMenuItem(id)

      invalidateCategoriesCache()

      const data = await fetchMenu()
      setItems(data.items)
    } catch (err) {
      setFormError(err.message)
    }
  }

  function startEdit(item) {
    setEditingId(item.id)
    setForm({
      name: item.name || '',
      category: item.category || '',
      basePrice: item.basePrice ?? '',
      description: item.description || '',
      isAvailable: item.isAvailable ?? true,
      slug: item.slug || '',
      image: item.image || '',
    })
    setFormError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  if (loading) return <Typography sx={{ p: 2 }}>Loading menu items...</Typography>
  if (error) return <ErrorMsg>{error}</ErrorMsg>

  return (
    <PageWrap>
      <Typography variant="h5" sx={{ fontWeight: 700 }}>
        Manage Menu Items
      </Typography>

      {/* ── Form ── */}
      <FormCard component="form" onSubmit={onSubmit}>
        <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 0.5 }}>
          {editingId ? 'Edit Item' : 'Create New Item'}
        </Typography>

        {formError && <ErrorMsg component="p">{formError}</ErrorMsg>}

        <FieldInput
          name="name"
          placeholder="Name"
          value={form.name}
          onChange={onFormChange}
        />
        <FieldInput
          name="category"
          placeholder="Category"
          value={form.category}
          onChange={onFormChange}
        />
        <FieldInput
          name="slug"
          placeholder="Slug (unique)"
          value={form.slug}
          onChange={onFormChange}
        />
        <FieldInput
          name="image"
          placeholder="Image URL"
          value={form.image}
          onChange={onFormChange}
        />
        <FieldInput
          name="basePrice"
          placeholder="Base Price"
          value={form.basePrice}
          onChange={onFormChange}
          type="number"
          step="0.01"
        />
        <FieldTextarea
          name="description"
          placeholder="Description"
          value={form.description}
          onChange={onFormChange}
          rows={3}
        />
        <CheckRow>
          <input
            type="checkbox"
            name="isAvailable"
            checked={form.isAvailable}
            onChange={onFormChange}
          />
          Available
        </CheckRow>

        <BtnRow>
          <PrimaryBtn type="submit" disabled={saving}>
            {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Create'}
          </PrimaryBtn>
          {editingId && (
            <GhostBtn type="button" onClick={cancelEdit}>
              Cancel
            </GhostBtn>
          )}
        </BtnRow>
      </FormCard>

      {/* ── Table ── */}
      <Box sx={{ overflowX: 'auto' }}>
        <StyledTable>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Category</Th>
              <Th>Slug</Th>
              <Th>Image</Th>
              <Th>Base Price</Th>
              <Th>Available</Th>
              <Th>Actions</Th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id}>
                <Td>{item.name}</Td>
                <Td>{item.category}</Td>
                <Td>{item.slug}</Td>
                <Td>
                  {item.image ? (
                    <img src={item.image} alt={item.name} width={48} style={{ borderRadius: 6, objectFit: 'cover' }} />
                  ) : '—'}
                </Td>
                <Td>L.L {item.basePrice}</Td>
                <Td>{item.isAvailable ? 'Yes' : 'No'}</Td>
                <Td>
                  <Box sx={{ display: 'flex', gap: 1 }}>
                    <EditBtn type="button" onClick={() => startEdit(item)}>Edit</EditBtn>
                    <DangerBtn type="button" onClick={() => handleDelete(item.id)}>Delete</DangerBtn>
                  </Box>
                </Td>
              </tr>
            ))}
          </tbody>
        </StyledTable>
      </Box>
    </PageWrap>
  )
}
