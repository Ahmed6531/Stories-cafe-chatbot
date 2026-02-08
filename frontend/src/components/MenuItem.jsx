import { useNavigate } from 'react-router-dom'
import '../styles/menu-item.css'

export default function MenuItem({ item }) {
  const navigate = useNavigate()
  const formatPrice = (p) => `L.L ${Number(p).toLocaleString()}`

  return (
    <div
      className="menu-item-card compact"
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/item/${item.slug}`)}
      onKeyDown={(e) => e.key === 'Enter' && navigate(`/item/${item.slug}`)}
    >
      <div className="menu-item-image-container compact">
        <img src={item.image} alt={item.name} className="menu-item-image" />
      </div>

      <div className="menu-item-content compact">
        <h3 className="menu-item-name">{item.name}</h3>
        <p className="menu-item-description">{item.description}</p>
        <div className="menu-item-price">{formatPrice(item.basePrice)}</div>
      </div>

      <div className="menu-item-footer">
        <span className={`pill ${item.isAvailable ? 'ok' : 'off'}`}>
          {item.isAvailable ? 'Available' : 'Out of stock'}
        </span>
      </div>
    </div>
  )
}
