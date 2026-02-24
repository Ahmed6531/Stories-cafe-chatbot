import { useNavigate, useLocation } from 'react-router-dom'

export default function Success() {
  const navigate = useNavigate()
  const location = useLocation()
  // Bug fix: show real order number from backend response
  const orderNumber = location.state?.orderNumber || 'SC-2026020712345'

  return (
    <div className="page-wrap" style={{ textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ marginBottom: '30px' }}>
        <div
          style={{
            fontSize: '80px',
            color: '#00704a',
            marginBottom: '20px',
          }}
        >
          ✓
        </div>
        <h1 className="menu-title">Order Placed Successfully!</h1>
        <p className="menu-subtitle" style={{ fontSize: '16px', marginTop: '10px' }}>
          Thank you for your order. We'll start preparing it right away.
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <p style={{ fontSize: '14px', color: '#79747e', marginBottom: '10px' }}>
          Order Number: <strong>#{orderNumber}</strong>
        </p>
        <p style={{ fontSize: '14px', color: '#79747e' }}>
          You will be notified when your order is ready.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          className="primary-btn"
          onClick={() => navigate('/')}
        >
          Back to Home
        </button>
      </div>
    </div>
  )
}
