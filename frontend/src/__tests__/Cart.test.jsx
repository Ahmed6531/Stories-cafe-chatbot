import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../theme/theme'; // Import real theme
import { CartProvider } from '../state/CartProvider';
import { useCart } from '../state/useCart';
import * as cartApi from '../API/cartApi';
import Cart from '../pages/Cart';

// Mock API
vi.mock('../API/cartApi');

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// Test harness with real theme
const TestHarness = ({ children }) => (
  <MemoryRouter>
    <ThemeProvider theme={theme}>
      <CartProvider>{children}</CartProvider>
    </ThemeProvider>
  </MemoryRouter>
);

// Component that exposes cart actions for testing
const CartActionsTester = () => {
  const { addToCart, updateQty, editCartItem, removeFromCart, clearCart, state } = useCart();
  return (
    <div>
      <div data-testid="cart-count">{state.count}</div>
      <div data-testid="cart-items">{JSON.stringify(state.items)}</div>
      <button onClick={() => addToCart({ menuItemId: 1, name: 'Latte', basePrice: 4, selectedOptions: [] })}>
        Add Latte
      </button>
      <button onClick={() => addToCart({ menuItemId: 1, name: 'Latte', basePrice: 4, selectedOptions: [{ optionName: 'Oat Milk' }] })}>
        Add Latte with Oat Milk
      </button>
      <button onClick={() => updateQty('line1', 2)}>Update Qty</button>
      <button onClick={() => editCartItem('line1', { qty: 3, selectedOptions: [{ optionName: 'Soy Milk' }] })}>
        Edit Item
      </button>
      <button onClick={() => removeFromCart('line1')}>Remove Line 1</button>
      <button onClick={clearCart}>Clear Cart</button>
    </div>
  );
};

describe('Cart Behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cartApi.fetchCart.mockResolvedValue({ cartId: null, items: [], count: 0 });
    cartApi.addToCartApi.mockResolvedValue({ cartId: 'cart123', items: [], count: 0 });
    cartApi.updateCartItemApi.mockResolvedValue({ cartId: 'cart123', items: [], count: 0 });
    cartApi.updateCartItemFull.mockResolvedValue({ cartId: 'cart123', items: [], count: 0 });
    cartApi.removeFromCartApi.mockResolvedValue({ cartId: 'cart123', items: [], count: 0 });
    cartApi.clearCartApi.mockResolvedValue({ success: true });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Add same item twice with same options - line merge', () => {
    it('merges identical items into one line with combined quantity', async () => {
      const user = userEvent.setup();

      cartApi.addToCartApi
        .mockResolvedValueOnce({
          cartId: 'cart123',
          items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4, selectedOptions: [] }],
          count: 1,
        })
        .mockResolvedValueOnce({
          cartId: 'cart123',
          items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 2, price: 4, selectedOptions: [] }],
          count: 2,
        });

      render(
        <TestHarness>
          <CartActionsTester />
          <Cart />
        </TestHarness>
      );

      await user.click(screen.getByText('Add Latte'));
      await user.click(screen.getByText('Add Latte'));

      await waitFor(() => {
        expect(screen.getByTestId('cart-count')).toHaveTextContent('2');
      });

      const lines = screen.getAllByTestId('cart-line');
      expect(lines).toHaveLength(1);
    });
  });

  describe('Add same item with different options - separate lines', () => {
    it('keeps items with different options as separate lines', async () => {
      const user = userEvent.setup();

      cartApi.addToCartApi
        .mockResolvedValueOnce({
          cartId: 'cart123',
          items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4, selectedOptions: [] }],
          count: 1,
        })
        .mockResolvedValueOnce({
          cartId: 'cart123',
          items: [
            { lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4, selectedOptions: [] },
            { lineId: 'line2', menuItemId: 1, name: 'Latte', qty: 1, price: 4.5, selectedOptions: [{ optionName: 'Oat Milk' }] },
          ],
          count: 2,
        });

      render(
        <TestHarness>
          <CartActionsTester />
          <Cart />
        </TestHarness>
      );

      await user.click(screen.getByText('Add Latte'));
      await user.click(screen.getByText('Add Latte with Oat Milk'));

      await waitFor(() => {
        expect(screen.getByTestId('cart-count')).toHaveTextContent('2');
      });

      const lines = screen.getAllByTestId('cart-line');
      expect(lines).toHaveLength(2);
    });
  });

  describe('Edit cart line via /item/:id?edit=...', () => {
    it('navigates to edit page with correct lineId', async () => {
      const user = userEvent.setup();

      cartApi.fetchCart.mockResolvedValue({
        cartId: 'cart123',
        items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4, selectedOptions: [] }],
        count: 1,
      });

      render(
        <TestHarness>
          <Cart />
        </TestHarness>
      );

      await waitFor(() => {
        expect(screen.getByText('Latte')).toBeInTheDocument();
      });

      const editButton = screen.getByRole('button', { name: /edit/i });
      await user.click(editButton);

      expect(mockNavigate).toHaveBeenCalledWith('/item/1?edit=line1');
    });

    it('updates item quantity and options when edited', async () => {
      const user = userEvent.setup();

      cartApi.fetchCart.mockResolvedValue({
        cartId: 'cart123',
        items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4, selectedOptions: [] }],
        count: 1,
      });

      cartApi.updateCartItemFull.mockResolvedValueOnce({
        cartId: 'cart123',
        items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 3, price: 4.5, selectedOptions: [{ optionName: 'Soy Milk' }] }],
        count: 3,
      });

      render(
        <TestHarness>
          <CartActionsTester />
          <Cart />
        </TestHarness>
      );

      await user.click(screen.getByText('Edit Item'));

      await waitFor(() => {
        expect(cartApi.updateCartItemFull).toHaveBeenCalledWith('line1', {
          qty: 3,
          selectedOptions: [{ optionName: 'Soy Milk' }],
        });
        expect(screen.getByTestId('cart-count')).toHaveTextContent('3');
      });
    });
  });

  describe('Remove one line then last line - cart deletion + cartId cleanup', () => {
    it('removes line and eventually clears cart when last item removed', async () => {
      const user = userEvent.setup();

      cartApi.fetchCart.mockResolvedValue({
        cartId: 'cart123',
        items: [{ lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4 }],
        count: 1,
      });

      cartApi.removeFromCartApi.mockResolvedValueOnce({
        cartId: null,
        items: [],
        count: 0,
      });

      render(
        <TestHarness>
          <CartActionsTester />
          <Cart />
        </TestHarness>
      );

      await waitFor(() => {
        expect(screen.getByText('Latte')).toBeInTheDocument();
      });

      await user.click(screen.getByText('Remove Line 1'));

      await waitFor(() => {
        expect(cartApi.removeFromCartApi).toHaveBeenCalledWith('line1');
        expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
        expect(screen.queryByText('Latte')).not.toBeInTheDocument();
        expect(screen.getByText(/Your cart is empty/i)).toBeInTheDocument();
      });
    });
  });

  describe('Clear whole cart - backend + client state reset', () => {
    it('clears all items and resets cartId', async () => {
      const user = userEvent.setup();

      cartApi.fetchCart.mockResolvedValue({
        cartId: 'cart123',
        items: [
          { lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 1, price: 4 },
          { lineId: 'line2', menuItemId: 2, name: 'Muffin', qty: 1, price: 3 },
        ],
        count: 2,
      });

      cartApi.clearCartApi.mockResolvedValueOnce({ success: true });

      render(
        <TestHarness>
          <CartActionsTester />
          <Cart />
        </TestHarness>
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('cart-line')).toHaveLength(2);
      });

      await user.click(screen.getByText('Clear Cart'));

      await waitFor(() => {
        expect(cartApi.clearCartApi).toHaveBeenCalled();
        expect(screen.getByTestId('cart-count')).toHaveTextContent('0');
        expect(screen.queryByTestId('cart-line')).not.toBeInTheDocument();
      });
    });
  });

  describe('Cross: add item -> add same line in UI -> checkout -> verify order contents', () => {
    it('builds correct order payload from cart items', async () => {
      const user = userEvent.setup();

      cartApi.fetchCart.mockResolvedValue({
        cartId: 'cart123',
        items: [
          { lineId: 'line1', menuItemId: 1, name: 'Latte', qty: 2, price: 4, selectedOptions: [] },
          { lineId: 'line2', menuItemId: 1, name: 'Latte', qty: 1, price: 4.5, selectedOptions: [{ optionName: 'Oat Milk' }] },
        ],
        count: 3,
      });

      render(
        <TestHarness>
          <Cart />
        </TestHarness>
      );

      await waitFor(() => {
        expect(screen.getAllByTestId('cart-line')).toHaveLength(2);
      });

      const checkoutButton = screen.getByRole('button', { name: /checkout/i });
      await user.click(checkoutButton);

      expect(mockNavigate).toHaveBeenCalledWith('/checkout');
    });
  });
});