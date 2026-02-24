import { useNavigate } from 'react-router-dom'
import Box from '@mui/material/Box'

export default function Success() {
  const navigate = useNavigate()
  const location = useLocation()
  // Bug fix: show real order number from backend response
  const orderNumber = location.state?.orderNumber || 'SC-2026020712345'

  return (
    <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '14px', textAlign: 'center', padding: '40px 20px' }}>
      <div style={{ marginBottom: '30px' }}>
        <div style={{ fontSize: '80px', color: '#00704a', marginBottom: '20px' }}>
          ✓
        </div>
        <h1 style={{ fontFamily: "'DIN Alternate Bold', 'Montserrat', sans-serif", fontSize: '28px', fontWeight: 700, color: '#00704a', margin: 0 }}>
          Order Placed Successfully!
        </h1>
        <p style={{ fontFamily: "'Montserrat', sans-serif", fontSize: '16px', color: '#79747e', marginTop: '10px', marginBottom: 0 }}>
          Thank you for your order. We'll start preparing it right away.
        </p>
      </div>

      <div style={{ marginBottom: '30px' }}>
        <p style={{ fontSize: '14px', color: '#79747e', marginBottom: '10px' }}>
          Order Number: <strong>#{orderNumber}</strong>
        </p>
        <p style={{ fontSize: '14px', color: '#79747e', margin: 0 }}>
          You will be notified when your order is ready.
        </p>
      </div>

      <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={() => navigate('/')}
          style={{ border: 0, background: '#00704a', color: '#fff', fontWeight: 900, borderRadius: '12px', padding: '12px 24px', cursor: 'pointer', fontSize: '16px', fontFamily: 'inherit' }}
        >
          Back to Home
        </button>
      </div>
    </Box>
  )
}