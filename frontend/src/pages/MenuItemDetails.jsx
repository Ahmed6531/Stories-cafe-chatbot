import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchMenuItemById } from '../API/menuApi'
import { useCart } from '../state/useCart'
import { formatLL } from '../data/variantCatalog'
import '../styles/menu_item.css'

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
      <div className="page-wrap state-wrap">
        <h1 className="state-title">Loading item...</h1>
        <p className="state-text">Please wait a moment.</p>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="page-wrap state-wrap">
        <h1 className="state-title">Item not found</h1>
        <p className="state-text">Try browsing the menu and selecting another item.</p>
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

    const payload = {
      menuItemId: item.mongoId || item.id,
      qty,
      selectedOptions: selectedOption ? [selectedOption] : [],
      instructions: ""
    }

    try {
      await addToCart(payload)
      navigate('/cart')
    } catch (err) {
      console.error(err)
      alert("Failed to add to cart")
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
                        <span className="option-price">
                          +<span className="currency-prefix">LL</span> {Number(option.priceDelta).toLocaleString()}
                        </span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Price Display */}
          <div className="details-price-section">
            <div className="details-price">
              <span className="currency-prefix">LL</span> {Number(finalPrice).toLocaleString()}
            </div>
            {qty > 1 && (
              <div className="total-price">
                Total: <span className="currency-prefix">LL</span> {Number(totalPrice).toLocaleString()}
              </div>
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
