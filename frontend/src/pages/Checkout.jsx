import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCart } from '../state/useCart';
import http from '../API/http';
import { formatLL } from '../data/variantCatalog';
import '../styles/cart-checkout.css';

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

  const subtotal = items.reduce((sum, item) => sum + (item.price || 0) * item.qty, 0);

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

    // Logic from fix branch: Create actual order
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
        selectedOptions: item.selectedOptions,
        instructions: item.instructions || ''
      })),
      cartId: localStorage.getItem('cartId')
    };

    try {
      const response = await http.post('/orders', payload);
      if (response.data.orderNumber) {
        localStorage.removeItem('cartId'); // Match functional fix
        navigate('/success', { state: { orderNumber: response.data.orderNumber } });
      }
    } catch (err) {
      console.error(err);
      alert('Failed to place order: ' + (err.response?.data?.error || err.message));
    }
  };

  if (cartCount === 0) {
    navigate('/menu');
    return null;
  }

  return (
    <div className="page-wrap checkout-page-legacy" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', padding: '40px' }}>
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
              <option value="delivery">Delivery</option>
            </select>
          </div>
          {formData.orderType === 'delivery' && (
            <div>
              <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>
                Delivery Address *
              </label>
              <textarea
                name="address"
                value={formData.address}
                onChange={handleChange}
                required
                rows="2"
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
          )}
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
          <div className="summary-details">
            {items.map(item => (
              <div key={item.lineId} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px' }}>
                <span>{item.qty}x {item.name}</span>
                <span>{formatLL(item.price * item.qty)}</span>
              </div>
            ))}
            <hr style={{ margin: '15px 0', border: '0', borderTop: '1px solid #ddd' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', fontSize: '18px' }}>
              <span>Total</span>
              <span>{formatLL(subtotal)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
