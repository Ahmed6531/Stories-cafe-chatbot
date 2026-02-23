import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from '../state/useCart';
import '../styles/cart-checkout.css';

function Cart() {
  const navigate = useNavigate();
  const { state, updateQty, removeFromCart } = useCart();
  const { items: cartItems, loading } = state;

  // Calculate total price
  const totalPrice = cartItems.reduce(
    (total, item) => total + (item.price || 0) * item.qty,
    0
  );

  const handleCheckout = () => {
    navigate('/checkout');
  };

  // Placeholder image URL
  const placeholderImg = "https://via.placeholder.com/100/8B7355/FFFFFF?text=Coffee";

  if (loading) {
    return (
      <div className="checkout-page">
        <div className="checkout-container">
          <p>Loading your cart...</p>
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
        {cartItems.length === 0 ? (
          <div className="empty-cart">
            <p>Your cart is empty</p>
            <Link to="/">
              <button className="btn-primary">Continue Shopping</button>
            </Link>
          </div>
        ) : (
          <div className="cart-content">
            {/* Cart Items */}
            <div className="cart-items">
              {cartItems.map((item) => (
                <div key={item.lineId} className="cart-item">
                  {/* Item Image */}
                  <div className="item-image">
                    <img
                      src={item.image || placeholderImg}
                      alt={item.name}
                    />
                  </div>

                  {/* Item Details */}
                  <div className="item-details">
                    <h3>{item.name}</h3>
                    <p className="item-price">L.L {Number(item.price).toLocaleString()}</p>
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
                    L.L {Number(item.price * item.qty).toLocaleString()}
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
                <span>L.L {Number(totalPrice).toLocaleString()}</span>
              </div>

              <div className="summary-row">
                <span>Tax (estimated)</span>
                <span>L.L {Number(totalPrice * 0.08).toLocaleString()}</span>
              </div>

              <div className="summary-divider"></div>

              <div className="summary-row total">
                <span>Total</span>
                <span>L.L {Number(totalPrice * 1.08).toLocaleString()}</span>
              </div>

              <button
                className="btn-checkout"
                disabled={cartItems.length === 0}
                onClick={handleCheckout}
              >
                Proceed to Checkout
              </button>

              <Link to="/" className="continue-shopping">
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
