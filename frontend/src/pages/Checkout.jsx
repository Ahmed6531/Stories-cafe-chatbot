import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'

const inputStyle = {
  width: '100%',
  padding: '12px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
}

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontWeight: 'bold',
}

export default function Checkout() {
  const navigate = useNavigate()
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    orderType: 'pickup',
    notes: '',
  })

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!formData.name || !formData.phone) {
      alert('Please fill in all required fields')
      return
    }
    navigate('/success')
  }

  return (
    <Box sx={{
      width: '100%',
      display: 'grid',
      gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
      gap: '30px',
    }}>
      <div>
        <h1 style={{ fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif", fontSize: '28px', fontWeight: 700, color: '#00704a', margin: '0 0 20px 0' }}>
          Checkout
        </h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input type="text" name="name" value={formData.name} onChange={handleChange} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Phone Number *</label>
            <input type="tel" name="phone" value={formData.phone} onChange={handleChange} required style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Order Type</label>
            <select name="orderType" value={formData.orderType} onChange={handleChange} style={inputStyle}>
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine In</option>
            </select>
          </div>
          <div>
            <label style={labelStyle}>Special Notes</label>
            <textarea name="notes" value={formData.notes} onChange={handleChange} rows="4" style={inputStyle} />
          </div>
          <button
            type="submit"
            style={{ marginTop: '12px', border: 0, background: '#00704a', color: '#fff', fontWeight: 900, borderRadius: '12px', padding: '12px 14px', cursor: 'pointer', width: '100%', fontSize: '16px', fontFamily: 'inherit' }}
          >
            Place Order
          </button>
        </form>
      </div>

      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>Order Summary</h2>
        <div style={{ padding: '20px', border: '1px solid #e0e0e0', borderRadius: '12px', backgroundColor: '#f5f5f5' }}>
          {/* Order summary placeholder */}
        </div>
      </div>
    </Box>
  )
}