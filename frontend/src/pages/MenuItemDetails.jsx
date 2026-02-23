import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
import { useCart } from '../state/useCart'
import '../styles/menu.css'

export default function MenuItemDetails() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)
  const [qty, setQty] = useState(1)
  const [selectedOption, setSelectedOption] = useState(null)

  // Fetch item from API on mount
  useEffect(() => {
    const loadItem = async () => {
      try {
        setLoading(true)
        const data = await fetchMenuItemById(id)
        setItem(data)
      } catch (err) {
        console.error('Failed to fetch item:', err)
        setItem(null)
      } finally {
        setLoading(false)
      }
    }

    loadItem()
  }, [id])

  if (loading) {
    return (
      <div className="page-wrap">
        <h1 className="menu-title">Loading...</h1>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="page-wrap">
        <h1 className="menu-title">Item not found</h1>
      </div>
    )
  }

  // Calculate price with selected option
  const optionPriceDelta = selectedOption ? item.options.find(opt => opt.label === selectedOption)?.priceDelta || 0 : 0
  const finalPrice = item.basePrice + optionPriceDelta
  const totalPrice = finalPrice * qty

  const handleAddToCart = async () => {
    // Validate that an option is selected if options exist
    if (item.options && item.options.length > 0 && !selectedOption) {
      alert('Please select an option')
      return
    }

    // Bug fix: actually add item to cart via CartProvider
    const payload = {
      menuItemId: item.mongoId || item.id,
      qty,
      selectedOptions: selectedOption ? [selectedOption] : [],
      instructions: ''
    }

    try {
      await addToCart(payload)
      navigate('/cart')
    } catch (err) {
      console.error(err)
      alert('Failed to add to cart')
    }
  }

  return (
    <div className="page-wrap details">
      <div className="details-card">
        <div className="details-img">
          <img src={item.image} alt={item.name} />
        </div>

        <div className="details-info">
          <h1 className="menu-title">{item.name}</h1>
          <p className="menu-subtitle">{item.description}</p>

          {/* Options Section */}
          {item.options && item.options.length > 0 && (
            <div className="options-section">
              <h3 className="options-title">Select Size/Type</h3>
              <div className="options-list">
                {item.options.map((option) => (
                  <label key={option.label} className="option-item">
                    <input
                      type="radio"
                      name="item-option"
                      value={option.label}
                      checked={selectedOption === option.label}
                      onChange={(e) => setSelectedOption(e.target.value)}
                    />
                    <span className="option-label">
                      {option.label}
                      {option.priceDelta > 0 && (
                        <span className="option-price"> +L.L {Number(option.priceDelta).toLocaleString()}</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Price Display */}
          <div className="details-price-section">
            <div className="details-price">L.L {Number(finalPrice).toLocaleString()}</div>
            {qty > 1 && (
              <div className="total-price">Total: L.L {Number(totalPrice).toLocaleString()}</div>
            )}
          </div>

          {/* Quantity Counter */}
          <div className="qty-counter">
            <span className="qty-label">Quantity:</span>
            <button
              className="qty-btn qty-minus"
              type="button"
              onClick={() => setQty(Math.max(1, qty - 1))}
            >
              −
            </button>
            <span className="qty-display">{qty}</span>
            <button
              className="qty-btn qty-plus"
              type="button"
              onClick={() => setQty(qty + 1)}
            >
              +
            </button>
          </div>

          {/* Add to Cart Button */}
          <button
            className="primary-btn"
            type="button"
            onClick={handleAddToCart}
            disabled={!item.isAvailable}
          >
            Add to Cart
          </button>
        </div>
      </div>
    </div>
  )
}
