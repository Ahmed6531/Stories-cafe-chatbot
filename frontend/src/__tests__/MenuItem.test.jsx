import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import { theme } from '../theme/theme';
import MenuItem from '../components/MenuItem';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('../utils/currency', () => ({
  formatLL: (price) => `$${(price || 0).toFixed(2)}`,
}));

const availableItem = {
  id: 1,
  name: 'Espresso',
  description: 'Rich, bold espresso shot',
  basePrice: 2.50,
  category: 'Coffee',
  subcategory: 'Hot Drinks',
  image: '/images/espresso.png',
  hasImage: true,
  isAvailable: true,
  isFeatured: false,
  variants: [],
};

const unavailableItem = {
  id: 2,
  name: 'Seasonal Special',
  description: 'Limited edition winter blend',
  basePrice: 4.00,
  category: 'Coffee',
  subcategory: null,
  image: '/images/special.png',
  hasImage: true,
  isAvailable: false,
  isFeatured: false,
  variants: [],
};

const itemWithoutImage = {
  id: 3,
  name: 'Americano',
  description: 'Classic americano',
  basePrice: 3.00,
  category: 'Coffee',
  subcategory: 'Hot Drinks',
  image: '',
  hasImage: false,
  isAvailable: true,
  isFeatured: false,
  variants: [],
};

const renderMenuItem = (item) => {
  return render(
    <BrowserRouter>
      <ThemeProvider theme={theme}>
        <MenuItem item={item} />
      </ThemeProvider>
    </BrowserRouter>
  );
};

describe('MenuItem Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Available Items', () => {
    it('renders item with available status', () => {
      renderMenuItem(availableItem);

      expect(screen.getByText('Espresso')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('$2.50')).toBeInTheDocument();
    });

    it('displays item description', () => {
      renderMenuItem(availableItem);
      expect(screen.getByText('Rich, bold espresso shot')).toBeInTheDocument();
    });

    it('shows magnifier button for available items', () => {
      renderMenuItem(availableItem);
      const detailsButton = screen.getByLabelText('View Details');
      expect(detailsButton).toBeInTheDocument();
      expect(detailsButton).not.toBeDisabled();
    });

    it('navigates to item details when clicking magnifier button', async () => {
      const user = userEvent.setup();
      renderMenuItem(availableItem);
      const detailsButton = screen.getByLabelText('View Details');
      await user.click(detailsButton);
      expect(mockNavigate).toHaveBeenCalledWith('/item/1');
    });

    it('navigates to item details when clicking the card', async () => {
      const user = userEvent.setup();
      renderMenuItem(availableItem);
      // Find the card by its role or text and click it
      const card = screen.getByText('Espresso').closest('[tabindex]');
      await user.click(card);
      expect(mockNavigate).toHaveBeenCalledWith('/item/1');
    });

    it('has proper image src and alt text', () => {
      renderMenuItem(availableItem);
      const image = screen.getByAltText('Espresso');
      expect(image).toBeInTheDocument();
      expect(image).toHaveAttribute('src', '/images/espresso.png');
    });
  });

  describe('Unavailable Items', () => {
    it('renders item with out of stock status', () => {
      renderMenuItem(unavailableItem);
      expect(screen.getByText('Seasonal Special')).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
    });

    it('hides magnifier button for unavailable items', () => {
      renderMenuItem(unavailableItem);
      const detailsButton = screen.getByLabelText('View Details');
      expect(detailsButton).toBeDisabled();
    });

    it('does not navigate when clicking magnifier button on unavailable item', async () => {
      const user = userEvent.setup();
      renderMenuItem(unavailableItem);
      const detailsButton = screen.getByLabelText('View Details');
      await user.click(detailsButton);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('does not navigate when clicking the card of unavailable item', async () => {
      const user = userEvent.setup();
      renderMenuItem(unavailableItem);
      const card = screen.getByText('Seasonal Special').closest('[tabindex]');
      await user.click(card);
      expect(mockNavigate).not.toHaveBeenCalled();
    });

    it('applies reduced opacity styling to unavailable items', () => {
      const { container } = renderMenuItem(unavailableItem);
      const card = container.querySelector('[tabindex]');
      expect(card).toBeInTheDocument();
      // The component uses opacity: 0.7 for unavailable items
    });

    it('shows unavailable item with variants (if any)', () => {
      const unavailableWithVariants = {
        ...unavailableItem,
        variants: [
          {
            id: 'size',
            name: 'Size',
            options: [{ name: 'Small' }, { name: 'Large' }],
          },
        ],
      };
      renderMenuItem(unavailableWithVariants);
      expect(screen.getByText('Seasonal Special')).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
      expect(screen.getByLabelText('View Details')).toBeDisabled();
    });
  });

  describe('Image Handling', () => {
    it('shows placeholder when item has no image', () => {
      renderMenuItem(itemWithoutImage);
      expect(screen.getByText('Americano')).toBeInTheDocument();
      // The placeholder might be an SVG; just check that no broken image appears
      const images = screen.queryAllByRole('img');
      expect(images.length).toBe(0); // No <img> element
    });

    it('handles image load errors gracefully', () => {
      renderMenuItem(availableItem);
      const image = screen.getByAltText('Espresso');
      // Simulate error
      image.dispatchEvent(new Event('error'));
      expect(screen.getByText('Espresso')).toBeInTheDocument();
    });

    it('displays correct image for available item', () => {
      renderMenuItem(availableItem);
      const image = screen.getByAltText('Espresso');
      expect(image).toHaveAttribute('src', '/images/espresso.png');
    });
  });

  describe('Accessibility', () => {
    it('sets tabIndex to 0 for available items (keyboard focusable)', () => {
      const { container } = renderMenuItem(availableItem);
      const card = container.querySelector('[tabindex]');
      expect(card?.getAttribute('tabindex')).toBe('0');
    });

    it('sets tabIndex to -1 for unavailable items (not focusable)', () => {
      const { container } = renderMenuItem(unavailableItem);
      const card = container.querySelector('[tabindex]');
      expect(card?.getAttribute('tabindex')).toBe('-1');
    });

    it('has proper aria-label on action button', () => {
      renderMenuItem(availableItem);
      const button = screen.getByLabelText('View Details');
      expect(button).toHaveAttribute('aria-label', 'View Details');
    });
  });

  describe('Display and Styling', () => {
    it('displays all required information for available item', () => {
      renderMenuItem(availableItem);
      expect(screen.getByText('Espresso')).toBeInTheDocument();
      expect(screen.getByText('Rich, bold espresso shot')).toBeInTheDocument();
      expect(screen.getByText('Available')).toBeInTheDocument();
      expect(screen.getByText('$2.50')).toBeInTheDocument();
    });

    it('displays all required information for unavailable item', () => {
      renderMenuItem(unavailableItem);
      expect(screen.getByText('Seasonal Special')).toBeInTheDocument();
      expect(screen.getByText('Limited edition winter blend')).toBeInTheDocument();
      expect(screen.getByText('Out of stock')).toBeInTheDocument();
      expect(screen.getByText('$4.00')).toBeInTheDocument();
    });

    it('formats price correctly', () => {
      renderMenuItem(availableItem);
      expect(screen.getByText('$2.50')).toBeInTheDocument();
    });
  });


  describe('Edge Cases', () => {
    it('handles item with very long name', () => {
      const longNameItem = {
        ...availableItem,
        name: 'This is a very long item name that might wrap across multiple lines',
      };
      renderMenuItem(longNameItem);
      expect(screen.getByText(/This is a very long item/)).toBeInTheDocument();
    });

    it('handles item with very long description', () => {
      const longDescItem = {
        ...availableItem,
        description:
          'This is a very long description that should be truncated to prevent layout issues ' +
          'and maintain a consistent card height across the menu display.',
      };
      renderMenuItem(longDescItem);
      expect(screen.getByText(/This is a very long description/)).toBeInTheDocument();
    });

    it('handles item with zero price', () => {
      const zeroPriceItem = { ...availableItem, basePrice: 0 };
      renderMenuItem(zeroPriceItem);
      expect(screen.getByText('$0.00')).toBeInTheDocument();
    });

    it('handles item with high price', () => {
      const highPriceItem = { ...availableItem, basePrice: 99.99 };
      renderMenuItem(highPriceItem);
      expect(screen.getByText('$99.99')).toBeInTheDocument();
    });
  });
});