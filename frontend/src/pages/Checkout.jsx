import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import { useCart } from '../state/useCart';
import http from '../API/http';

const inputStyle = {
  width: '100%',
  padding: '12px',
  border: '1px solid #e0e0e0',
  borderRadius: '8px',
  fontSize: '14px',
  fontFamily: 'inherit',
  boxSizing: 'border-box',
};

const labelStyle = {
  display: 'block',
  marginBottom: '8px',
  fontWeight: 'bold',
};

export default function Checkout() {
  const navigate = useNavigate();
  const { state, cartCount } = useCart();
  const { items } = state;

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    orderType: 'pickup',
    notes: '',
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name || !formData.phone) {
      alert('Please fill in all required fields');
      return;
    }

    const payload = {
      orderType: formData.orderType,
      customer: {
        name: formData.name,
        phone: formData.phone,
        address: formData.orderType === 'delivery' ? formData.address : '',
      },
      notesToBarista: formData.notes,
      items: items.map((item) => ({
        menuItemId: item.menuItemId || item.id,
        qty: item.qty,
        selectedOptions: item.selectedOptions || [],
        instructions: item.instructions || '',
      })),
      cartId: localStorage.getItem('cartId'),
    };

    try {
      const response = await http.post('/orders', payload);
      if (response.data.orderNumber) {
        localStorage.removeItem('cartId');
        navigate('/success', { state: { orderNumber: response.data.orderNumber } });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to place order: ' + (err.response?.data?.error || err.message));
    }
  };

  return (
    <Box
      sx={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: { xs: '1fr', md: '1fr 1fr' },
        gap: '30px',
      }}
    >
      {/* ---------- Form Column ---------- */}
      <div>
        <h1
          style={{
            fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif",
            fontSize: '28px',
            fontWeight: 700,
            color: '#00704a',
            margin: '0 0 20px 0',
          }}
        >
          Checkout
        </h1>

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}
        >
          <div>
            <label style={labelStyle}>Full Name *</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Phone Number *</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              style={inputStyle}
            />
          </div>

          <div>
            <label style={labelStyle}>Order Type</label>
            <select
              name="orderType"
              value={formData.orderType}
              onChange={handleChange}
              style={inputStyle}
            >
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine In</option>
            </select>
          </div>

          <div>
            <label style={labelStyle}>Special Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="4"
              style={inputStyle}
            />
          </div>

          <button
            type="submit"
            style={{
              marginTop: '12px',
              border: 0,
              background: '#00704a',
              color: '#fff',
              fontWeight: 900,
              borderRadius: '12px',
              padding: '12px 14px',
              cursor: 'pointer',
              width: '100%',
              fontSize: '16px',
              fontFamily: 'inherit',
            }}
          >
            Place Order
          </button>
        </form>
      </div>

      {/* ---------- Summary Column ---------- */}
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>
          Order Summary
        </h2>
        <div
          style={{
            padding: '20px',
            border: '1px solid #e0e0e0',
            borderRadius: '12px',
            backgroundColor: '#f5f5f5',
          }}
        >
          {items.length === 0 ? (
            <p style={{ color: '#6b6b6b' }}>Your cart is empty.</p>
          ) : (
            items.map((item) => (
              <div
                key={item.lineId}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '10px',
                }}
              >
                <span>
                  {item.qty}x {item.name}
                </span>
                <span>L.L {Number((item.price || 0) * item.qty).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </Box>
  );
}