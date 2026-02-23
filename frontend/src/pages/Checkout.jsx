import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../state/useCart';
import http from '../API/http';

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

    // Bug fix: submit real order to backend
    const payload = {
      orderType: formData.orderType,
      customer: {
        name: formData.name,
        phone: formData.phone,
        address: formData.orderType === 'delivery' ? formData.address : ''
      },
      notesToBarista: formData.notes,
      items: items.map(item => ({
        menuItemId: item.menuItemId || item.id,
        qty: item.qty,
        selectedOptions: item.selectedOptions || [],
        instructions: item.instructions || ''
      })),
      cartId: localStorage.getItem('cartId')
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
    <div className="page-wrap" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px' }}>
      <div>
        <h1 className="menu-title">Checkout</h1>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Full Name *
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Phone Number *
            </label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              required
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Order Type
            </label>
            <select
              name="orderType"
              value={formData.orderType}
              onChange={handleChange}
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            >
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine In</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
              Special Notes
            </label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="4"
              style={{
                width: '100%',
                padding: '12px',
                border: '1px solid #e0e0e0',
                borderRadius: '8px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
          </div>
          <button type="submit" className="primary-btn" style={{ marginTop: '12px' }}>
            Place Order
          </button>
        </form>
      </div>
      <div>
        <h2 style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '20px' }}>Order Summary</h2>
        <div
          style={{
            padding: '20px',
            border: '1px solid #e0e0e0',
            borderRadius: '12px',
            backgroundColor: '#f5f5f5',
          }}
        >
          {items.map(item => (
            <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
              <span>{item.qty}x {item.name}</span>
              <span>L.L {Number((item.price || 0) * item.qty).toLocaleString()}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
