import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCart } from '../state/useCart'

export default function Checkout() {
  const { dispatch } = useCart()
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

function Checkout() {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cart");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // Sync cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (!formData.name || !formData.phone) {
      alert('Please fill in all required fields')
      return
    }

    try {
      // TODO: Make API call to create order
      // TODO: Dispatch does nothing (static), revert by restoring cartReducer logic for CLEAR_CART
      dispatch({ type: 'CLEAR_CART' }) // Static: does nothing
      navigate('/success')
    } catch (err) {
      alert('Error creating order: ' + err.message)
    }
  }

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
          {/* TODO: Restore order summary with dynamic items and total */}
          {/* Missing: state.items.map for item list, total calculation */}
          {/* Container kept empty as per requirements */}
        </div>
      </div>
    </div>
  )
}

export default Checkout;
