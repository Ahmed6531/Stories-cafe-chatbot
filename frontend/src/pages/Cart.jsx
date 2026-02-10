// TODO: Cart page is static (no items, no totals), revert by restoring state.items display and calculations
// Missing: Dynamic cart items list, total calculation, edit/remove functionality

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import '../styles/cart-checkout.css';

function Cart() {
  const [cartItems, setCartItems] = useState(() => {
    const savedCart = localStorage.getItem("cart");
    return savedCart ? JSON.parse(savedCart) : [];
  });

  // Sync cart to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("cart", JSON.stringify(cartItems));
  }, [cartItems]);

  // Update quantity functions
  const increaseQty = (id) => {
    setCartItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, quantity: item.quantity + 1 } : item
      )
    );
  };

  const decreaseQty = (id) => {
    setCartItems((items) =>
      items
        .map((item) =>
          item.id === id ? { ...item, quantity: item.quantity - 1 } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  // Remove item function
  const removeItem = (id) => {
    setCartItems(cartItems.filter((item) => item.id !== id));
  };

  // Calculate total price
  const totalPrice = cartItems.reduce(
    (total, item) => total + item.price * item.quantity,
    0
  );

  const handleCheckout = () => {
    alert("Order has been placed");
  };

  // Placeholder image URL
  const placeholderImg = "https://via.placeholder.com/100/8B7355/FFFFFF?text=Coffee";

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
                <div key={item.id} className="cart-item">
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
                    <p className="item-price">${item.price.toFixed(2)}</p>
                  </div>

                  {/* Quantity Controls */}
                  <div className="quantity-controls">
                    <button
                      className="qty-btn"
                      onClick={() => decreaseQty(item.id)}
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <span className="quantity">{item.quantity}</span>
                    <button
                      className="qty-btn"
                      onClick={() => increaseQty(item.id)}
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>

                  {/* Item Total */}
                  <div className="item-total">
                    ${(item.price * item.quantity).toFixed(2)}
                  </div>

                  {/* Remove Button */}
                  <button
                    className="btn-remove"
                    onClick={() => removeItem(item.id)}
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
                <span>${totalPrice.toFixed(2)}</span>
              </div>
              
              <div className="summary-row">
                <span>Tax (estimated)</span>
                <span>${(totalPrice * 0.08).toFixed(2)}</span>
              </div>
              
              <div className="summary-divider"></div>
              
              <div className="summary-row total">
                <span>Total</span>
                <span>${(totalPrice * 1.08).toFixed(2)}</span>
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
