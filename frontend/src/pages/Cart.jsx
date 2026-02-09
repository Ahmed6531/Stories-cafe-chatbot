// TODO: Cart page is static (no items, no totals), revert by restoring state.items display and calculations
// Missing: Dynamic cart items list, total calculation, edit/remove functionality
import { useNavigate } from 'react-router-dom'

export default function Cart() {
  const navigate = useNavigate()

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>Shopping Cart</h1>
      <button
        type="button"
        onClick={() => navigate('/')}
        style={{ margin: '10px', padding: '10px 20px', background: '#00704a', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        Back to Home
      </button>
      <button
        type="button"
        onClick={() => navigate('/checkout')}
        style={{ margin: '10px', padding: '10px 20px', background: '#00704a', color: 'white', border: 'none', borderRadius: '5px' }}
      >
        Proceed to Checkout
      </button>
    </div>
  )
}
