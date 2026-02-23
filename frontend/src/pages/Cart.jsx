import { Link, useNavigate } from "react-router-dom";
import { useCart } from '../state/useCart';
import { formatLL } from '../data/variantCatalog';
import '../styles/cart-checkout.css';

function Cart() {
  const navigate = useNavigate();
  const { state, updateQty, removeFromCart } = useCart();
  const { items, loading } = state;

  // Calculate total price using the new logic
  const subtotal = items.reduce(
    (total, item) => total + (item.price || 0) * item.qty,
    0
  );

  const handleCheckout = () => {
    navigate('/checkout');
  };

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <p className="state-text">Loading your cart...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="checkout-page">
      {/* Header */}
      <header className="checkout-header">
        <div className="header-content">
          <h1>Your Cart</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="checkout-container">
        {items.length === 0 ? (
          <div className="empty-cart">
            <p>Your cart is empty</p>
            <Link to="/menu">
              <button className="btn-primary">Browse Menu</button>
            </Link>
          </div>
        ) : (
          <div className="cart-content">
            {/* Cart Items */}
            <div className="cart-items">
              {items.map((item) => (
                <div key={item.lineId} className="cart-item">
                  {/* Item Image */}
                  <div className="item-image">
                    <img
                      src={item.image}
                      alt={item.name}
                    />
                  </div>

                  {/* Item Details */}
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    {item.selectedOptions?.length > 0 && (
                      <p className="item-variants">
                        {item.selectedOptions.join(', ')}
                      </p>
                    )}
                    <p className="item-price">{formatLL(item.price)}</p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="quantity-controls">
                    <button
                      className="qty-btn"
                      onClick={() => updateQty(item.lineId, item.qty - 1)}
                      disabled={item.qty <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="quantity">{item.qty}</span>
                    <button
                      className="qty-btn"
                      onClick={() => updateQty(item.lineId, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Item Total */}
                  <div className="item-total">
                    {formatLL(item.price * item.qty)}
                  </div>

                  {/* Remove Button */}
                  <button
                    className="btn-remove"
                    onClick={() => removeFromCart(item.lineId)}
                    aria-label="Remove item"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Order Summary */}
            <div className="order-summary">
              <h2>Order Summary</h2>

              <div className="summary-row">
                <span>Subtotal</span>
                <span>{formatLL(subtotal)}</span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-row total">
                <span>Total</span>
                <span className="total-price-val">{formatLL(subtotal)}</span>
              </div>

              <button
                className="btn-checkout"
                onClick={handleCheckout}
              >
                Proceed to Checkout
              </button>

              <Link to="/menu" className="continue-shopping">
                <button className="btn-secondary">Continue Shopping</button>
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Cart;
