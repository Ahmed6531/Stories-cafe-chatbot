// migrated from cart-checkout.css
import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from '../state/useCart';
import { Box, Typography, styled, keyframes } from '@mui/material';

const brand = {
  primary: '#00704a',
  primaryHover: '#147d56',
  primaryActive: '#004a34',
  primaryDark: '#1e5631',
  textPrimary: '#2b2b2b',
  textSecondary: '#79747e',
  border: '#e0e0e0',
  bgLight: '#f8f9f8',
  shadowSm: '0 0 6px rgba(0,0,0,0.06)',
  shadowMd: '0 2px 12px rgba(0,0,0,0.08)',
  shadowHover: '0 4px 12px rgba(0,0,0,0.15)',
  fontBase: "'Montserrat', sans-serif",
  fontDisplay: "'DIN Alternate Bold', 'Montserrat', sans-serif",
};

// --- Styled Components ---

const fadeIn = keyframes`
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

const CheckoutPage = styled(Box)(() => ({
  minHeight: '100vh',
  backgroundColor: '#f8f6f3',
  width: '100%',
  overflowX: 'hidden',
}));

const CheckoutHeader = styled('header')(() => ({
  backgroundColor: brand.primaryDark,
  color: '#f8f6f3',
  padding: '2rem 0',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1)',
  width: '100%',
  margin: 0,
  boxSizing: 'border-box',
  overflowX: 'hidden',
}));

const HeaderContent = styled(Box)(({ theme }) => ({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '0 2rem',

  '& h1': {
    margin: 0,
    fontSize: '2rem',
    fontWeight: 600,
    letterSpacing: '0.5px',

    [theme.breakpoints.down('md')]: {
      fontSize: '1.5rem',
    },
  },
}));

const CheckoutContainer = styled(Box)(({ theme }) => ({
  maxWidth: '1200px',
  margin: '0 auto',
  padding: '3rem 2rem',

  [theme.breakpoints.down('md')]: {
    padding: '2rem 1rem',
  },
}));

const EmptyCart = styled(Box)(() => ({
  textAlign: 'center',
  padding: '4rem 2rem',

  '& p': {
    fontSize: '1.5rem',
    color: '#6b6b6b',
    marginBottom: '2rem',
  },
}));

const CartContent = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '1fr 400px',
  gap: '3rem',
  alignItems: 'start',

  [theme.breakpoints.down('lg')]: {
    gridTemplateColumns: '1fr',
  },
}));

const CartItems = styled(Box)(({ theme }) => ({
  background: 'white',
  borderRadius: '12px',
  padding: '2rem',
  boxShadow: brand.shadowMd,

  [theme.breakpoints.down('md')]: {
    padding: '1.5rem',
  },
}));

const CartItemRow = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: '100px 1fr auto auto auto',
  gap: '1.5rem',
  alignItems: 'center',
  padding: '1.5rem 0',
  borderBottom: '1px solid #e8e5e1',
  position: 'relative',
  animation: `${fadeIn} 0.3s ease`,

  '&:last-child': {
    borderBottom: 'none',
  },

  '&:first-of-type': {
    paddingTop: 0,
  },

  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: '80px 1fr',
    gap: '1rem',
  },
}));

const ItemImage = styled(Box)(({ theme }) => ({
  width: '100px',
  height: '100px',
  borderRadius: '8px',
  overflow: 'hidden',
  backgroundColor: '#f0ede8',

  '& img': {
    width: '100%',
    height: '100%',
    objectFit: 'cover',
  },

  [theme.breakpoints.down('md')]: {
    width: '80px',
    height: '80px',
  },
}));

const ItemDetails = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',

  '& h3': {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 600,
    color: brand.textPrimary,
  },

  [theme.breakpoints.down('md')]: {
    gridColumn: '1 / -1',
  },
}));

const ItemPrice = styled('p')(() => ({
  margin: 0,
  fontSize: '0.95rem',
  color: brand.textSecondary,
}));

const QuantityControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '0.75rem',
  backgroundColor: '#f8f6f3',
  padding: '0.5rem',
  borderRadius: '8px',

  [theme.breakpoints.down('md')]: {
    gridColumn: '1 / -1',
    justifySelf: 'start',
  },
}));

const QuantityText = styled('span')(() => ({
  minWidth: '32px',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: '1rem',
}));

const QtyBtn = styled('button')(() => ({
  width: '32px',
  height: '32px',
  border: 'none',
  backgroundColor: brand.primaryDark,
  color: 'white',
  borderRadius: '6px',
  fontSize: '1.25rem',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontWeight: 500,

  '&:hover': {
    backgroundColor: brand.primaryDark,
    transform: 'scale(1.05)',
  },

  '&:active': {
    transform: 'scale(0.95)',
  },

  '&:disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
    transform: 'none',
  },
}));

const ItemTotal = styled(Box)(({ theme }) => ({
  fontWeight: 600,
  fontSize: '1.125rem',
  color: brand.textPrimary,
  minWidth: '80px',
  textAlign: 'right',

  [theme.breakpoints.down('md')]: {
    position: 'absolute',
    top: '1.5rem',
    right: '3rem',
  },
}));

const RemoveBtn = styled('button')(({ theme }) => ({
  width: '36px',
  height: '36px',
  border: 'none',
  backgroundColor: 'transparent',
  color: '#9b9b9b',
  fontSize: '2rem',
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '50%',
  lineHeight: 1,

  '&:hover': {
    backgroundColor: '#ffe5e5',
    color: '#d32f2f',
  },

  [theme.breakpoints.down('md')]: {
    position: 'absolute',
    top: '1.5rem',
    right: 0,
  },
}));

const OrderSummary = styled(Box)(({ theme }) => ({
  background: 'white',
  borderRadius: '12px',
  padding: '2rem',
  boxShadow: brand.shadowMd,
  position: 'sticky',
  top: '2rem',

  '& h2': {
    margin: '0 0 1.5rem 0',
    fontSize: '1.5rem',
    fontWeight: 600,
    color: brand.textPrimary,
  },

  [theme.breakpoints.down('md')]: {
    position: 'static',
  },
}));

const SummaryRow = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'isTotal',
})(({ isTotal }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1rem',
  color: brand.textSecondary,
  fontSize: '0.95rem',

  ...(isTotal && {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: brand.textPrimary,
    marginTop: '1rem',
  }),
}));

const SummaryDivider = styled(Box)(() => ({
  height: '1px',
  backgroundColor: '#e8e5e1',
  margin: '1.5rem 0',
}));

const BaseBtn = styled('button')(() => ({
  width: '100%',
  padding: '1rem 2rem',
  border: 'none',
  borderRadius: '8px',
  fontSize: '1rem',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'all 0.3s ease',
  fontFamily: brand.fontBase,
  letterSpacing: '0.5px',
}));

const PrimaryBtn = styled(BaseBtn)(() => ({
  backgroundColor: brand.primaryDark,
  color: 'white',

  '&:hover': {
    backgroundColor: brand.primaryDark,
    transform: 'translateY(-2px)',
  },
}));

const CheckoutBtnStyled = styled(BaseBtn)(() => ({
  backgroundColor: brand.primaryDark,
  color: 'white',
  marginTop: '1.5rem',
  marginBottom: '1rem',
  boxShadow: '0 4px 12px rgba(61, 46, 31, 0.2)',

  '&:hover': {
    backgroundColor: brand.primaryDark,
    transform: 'translateY(-2px)',
    boxShadow: '0 6px 16px rgba(61, 46, 31, 0.3)',
  },

  '&:active': {
    transform: 'translateY(0)',
  },

  '&:disabled': {
    backgroundColor: '#c4c4c4',
    cursor: 'not-allowed',
    transform: 'none',
    boxShadow: 'none',
  },
}));

const SecondaryBtn = styled(BaseBtn)(() => ({
  backgroundColor: 'transparent',
  color: '#3d2e1f',
  border: `2px solid ${brand.primaryDark}`,

  '&:hover': {
    backgroundColor: brand.primaryDark,
    color: 'white',
  },
}));

// --- Component Definition ---

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
      <CheckoutPage>
        <CheckoutContainer>
          <Typography>Loading your cart...</Typography>
        </CheckoutContainer>
      </CheckoutPage>
    );
  }

  return (
    <CheckoutPage>
      {/* Header */}
      <CheckoutHeader>
        <HeaderContent>
          <h1>Your Cart</h1>
        </HeaderContent>
      </CheckoutHeader>

      {/* Main Content */}
      <CheckoutContainer>
        {cartItems.length === 0 ? (
          <EmptyCart>
            <p>Your cart is empty</p>
            <Box component={Link} to="/" sx={{ textDecoration: 'none', display: 'block' }}>
              <PrimaryBtn>Continue Shopping</PrimaryBtn>
            </Box>
          </EmptyCart>
        ) : (
          <CartContent>
            {/* Cart Items */}
            <CartItems>
              {cartItems.map((item) => (
                <CartItemRow key={item.lineId}>
                  {/* Item Image */}
                  <ItemImage>
                    <img
                      src={item.image || placeholderImg}
                      alt={item.name}
                      onError={(e) => { e.currentTarget.src = placeholderImg; }}
                    />
                  </ItemImage>

                  {/* Item Details */}
                  <ItemDetails>
                    <h3>{item.name}</h3>
                    <ItemPrice>L.L {Number(item.price).toLocaleString()}</ItemPrice>
                  </ItemDetails>

                  {/* Quantity Controls */}
                  <QuantityControls>
                    <QtyBtn
                      onClick={() => updateQty(item.lineId, item.qty - 1)}
                      disabled={item.qty <= 1}
                      aria-label="Decrease quantity"
                    >
                      −
                    </QtyBtn>
                    <QuantityText>{item.qty}</QuantityText>
                    <QtyBtn
                      onClick={() => updateQty(item.lineId, item.qty + 1)}
                      aria-label="Increase quantity"
                    >
                      +
                    </QtyBtn>
                  </QuantityControls>

                  {/* Item Total */}
                  <ItemTotal>
                    L.L {Number(item.price * item.qty).toLocaleString()}
                  </ItemTotal>

                  {/* Remove Button */}
                  <RemoveBtn
                    onClick={() => removeFromCart(item.lineId)}
                    aria-label="Remove item"
                  >
                    ×
                  </RemoveBtn>
                </CartItemRow>
              ))}
            </CartItems>

            {/* Order Summary */}
            <OrderSummary>
              <h2>Order Summary</h2>

              <SummaryRow>
                <span>Subtotal</span>
                <span>L.L {Number(totalPrice).toLocaleString()}</span>
              </SummaryRow>

              <SummaryRow>
                <span>Tax (estimated)</span>
                <span>L.L {Number(totalPrice * 0.08).toLocaleString()}</span>
              </SummaryRow>

              <SummaryDivider />

              <SummaryRow isTotal>
                <span>Total</span>
                <span>L.L {Number(totalPrice * 1.08).toLocaleString()}</span>
              </SummaryRow>

              <CheckoutBtnStyled
                disabled={cartItems.length === 0}
                onClick={handleCheckout}
              >
                Proceed to Checkout
              </CheckoutBtnStyled>

              <Box component={Link} to="/" sx={{ textDecoration: 'none', display: 'block' }}>
                <SecondaryBtn>Continue Shopping</SecondaryBtn>
              </Box>
            </OrderSummary>
          </CartContent>
        )}
      </CheckoutContainer>
    </CheckoutPage>
  );
}

export default Cart;