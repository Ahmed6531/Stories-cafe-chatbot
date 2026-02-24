import { useNavigate } from 'react-router-dom'
import '../styles/menu-item.css'

export default function MenuItem({ item }) {
  const navigate = useNavigate()
  const formatPrice = (p) => `L.L ${Number(p).toLocaleString()}`

  const handleClick = () => {
    if (item.isAvailable) {
      navigate(`/item/${item.id}`)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && item.isAvailable) {
      navigate(`/item/${item.id}`)
    }
  }

  const handleAddClick = (e) => {
    e.stopPropagation()
    if (item.isAvailable) {
      navigate(`/item/${item.id}`)
    }
  }

  return (
    <div
      className={`menu-item-card compact ${!item.isAvailable ? 'unavailable' : ''}`}
      role={item.isAvailable ? "button" : undefined}
      tabIndex={item.isAvailable ? 0 : -1}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      <button
        type="button"
        className="menu-item-cta"
        aria-label={item.isAvailable ? `Add ${item.name}` : `${item.name} unavailable`}
        onClick={handleAddClick}
        disabled={!item.isAvailable}
      >
        <span className="menu-item-cta-plus">+</span>
      </button>
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
