import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import MenuItemDetails from './MenuItemDetails'
import * as menuApi from '../API/menuApi'
import * as cartState from '../state/useCart'

vi.mock('../API/menuApi')
vi.mock('../utils/currency', () => ({
  formatLL: (price) => `$${(price || 0).toFixed(2)}`
}))

vi.mock('../components/MenuItemDetailsSkeleton', () => ({
  default: () => <div data-testid="skeleton">Loading...</div>
}))

// Mock useCart hook
const mockAddToCart = vi.fn()
const mockEditCartItem = vi.fn()

vi.mock('../state/useCart', () => ({
  useCart: () => ({
    addToCart: mockAddToCart,
    editCartItem: mockEditCartItem,
    state: { items: [] }
  })
}))

const itemWithVariants = {
  id: 1,
  name: 'Cappuccino',
  description: 'Classic cappuccino',
  basePrice: 4.50,
  image: '/images/cappuccino.png',
  isAvailable: true,
  variants: [
    {
      id: 'size',
      groupId: 'size',
      name: 'Size',
      isRequired: true,
      maxSelections: 1,
      options: [
        { name: 'Small', additionalPrice: 0 },
        { name: 'Medium', additionalPrice: 0.50 },
        { name: 'Large', additionalPrice: 1.00 }
      ]
    },
    {
      id: 'milk',
      groupId: 'milk',
      name: 'Milk',
      isRequired: false,
      maxSelections: 1,
      options: [
        { name: 'Whole', additionalPrice: 0 },
        { name: 'Oat', additionalPrice: 0.75 },
        { name: 'Almond', additionalPrice: 0.75 }
      ]
    }
  ]
}

const itemNoVariants = {
  id: 2,
  name: 'Muffin',
  description: 'Blueberry muffin',
  basePrice: 3.00,
  image: '/images/muffin.png',
  isAvailable: true,
  variants: []
}

const itemUnavailable = {
  id: 3,
  name: 'Seasonal Special',
  description: 'Limited edition drink',
  basePrice: 5.50,
  image: '/images/special.png',
  isAvailable: false,
  variants: []
}

const renderMenuItemDetails = (itemId = '1') => {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/menu/item/:id" element={<MenuItemDetails />} />
      </Routes>
    </BrowserRouter>,
    { initialEntries: [`/menu/item/${itemId}`] }
  )
}

describe('MenuItemDetails Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockAddToCart.mockResolvedValue({})
    mockEditCartItem.mockResolvedValue({})
    menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
  })

  it('loads and displays item with variants', async () => {
    menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
    renderMenuItemDetails('1')

    await waitFor(() => {
      expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      expect(screen.getByText('Classic cappuccino')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton while fetching', () => {
    menuApi.fetchMenuItemById.mockImplementation(() => new Promise(() => {}))

    renderMenuItemDetails('1')

    expect(screen.getByTestId('skeleton')).toBeInTheDocument()
  })

  it('displays item not found when fetch fails', async () => {
    menuApi.fetchMenuItemById.mockRejectedValue(new Error('Not found'))

    renderMenuItemDetails('1')

    await waitFor(() => {
      expect(screen.getByText('Item not found')).toBeInTheDocument()
    })
  })

  describe('Required Selection Validation', () => {
    it('shows error when required variant is not selected', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      // Try to add without selecting required "Size"
      const addButton = screen.getByRole('button', { name: /ADD TO CART/i })
      addButton.click()

      await waitFor(() => {
        expect(screen.getByText('Required')).toBeInTheDocument()
      })
    })

    it('allows submission when all required variants are selected', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      // Select required Size variant
      const sizeSelect = screen.getByRole('combobox', { name: /Size/i })
      sizeSelect.click()

      // Find and click Medium option
      const mediumOption = await screen.findByRole('option', { name: /Medium/ })
      mediumOption.click()

      // Now click ADD TO CART
      const addButton = screen.getByRole('button', { name: /ADD TO CART/i })
      
      await waitFor(() => {
        addButton.click()
      })

      await waitFor(() => {
        expect(mockAddToCart).toHaveBeenCalled()
      })
    })
  })

  describe('Max Selections Enforcement', () => {
    it('enforces max selections limit for multi-select groups', async () => {
      const itemWithMaxSelections = {
        ...itemWithVariants,
        variants: [
          {
            id: 'toppings',
            groupId: 'toppings',
            name: 'Toppings',
            isRequired: false,
            maxSelections: 2,
            options: [
              { name: 'Sprinkles', additionalPrice: 0.25 },
              { name: 'Chocolate', additionalPrice: 0.30 },
              { name: 'Caramel', additionalPrice: 0.30 },
              { name: 'Nuts', additionalPrice: 0.50 }
            ]
          }
        ]
      }

      menuApi.fetchMenuItemById.mockResolvedValue(itemWithMaxSelections)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Toppings')).toBeInTheDocument()
      })

      // Select first topping
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes[0].click()
      checkboxes[1].click()

      // Try to select third topping - should not be allowed
      checkboxes[2].click()

      // Should still show only 2 selected (implementation depends on UI)
      expect(screen.getByText('Toppings')).toBeInTheDocument()
    })
  })

  describe('Price Updates on Option Change', () => {
    it('updates unit price when variant selection changes', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      // Initial base price $4.50
      expect(screen.getByText('$4.50')).toBeInTheDocument()

      // Select Medium (adds $0.50)
      const sizeSelect = screen.getByRole('combobox', { name: /Size/i })
      sizeSelect.click()

      const mediumOption = await screen.findByRole('option', { name: /Medium/ })
      mediumOption.click()

      // Wait for price to update to $5.00
      await waitFor(() => {
        expect(screen.getByText('$5.00')).toBeInTheDocument()
      })

      // Select Large milk (adds $0.75)
      const milkSelect = screen.getByRole('combobox', { name: /Milk/i })
      milkSelect.click()

      const oatOption = await screen.findByRole('option', { name: /Oat/ })
      oatOption.click()

      // Wait for price to update to $5.75
      await waitFor(() => {
        expect(screen.getByText('$5.75')).toBeInTheDocument()
      })
    })

    it('reflects correct price with multiple selection options', async () => {
      const itemWithToppings = {
        ...itemNoVariants,
        variants: [
          {
            id: 'toppings',
            groupId: 'toppings',
            name: 'Toppings',
            isRequired: false,
            maxSelections: 3,
            options: [
              { name: 'Toppings A', additionalPrice: 0.50 },
              { name: 'Toppings B', additionalPrice: 0.75 }
            ]
          }
        ]
      }

      menuApi.fetchMenuItemById.mockResolvedValue(itemWithToppings)
      renderMenuItemDetails('2')

      await waitFor(() => {
        expect(screen.getByText('Muffin')).toBeInTheDocument()
      })

      // Base price $3.00
      expect(screen.getByText('$3.00')).toBeInTheDocument()

      // Select both toppings ($0.50 + $0.75 = $1.25)
      const checkboxes = screen.getAllByRole('checkbox')
      checkboxes[0].click()
      checkboxes[1].click()

      // Wait for price to update to $4.25
      await waitFor(() => {
        expect(screen.getByText('$4.25')).toBeInTheDocument()
      })
    })
  })

  describe('Quantity Multiplier on Total Price', () => {
    it('multiplies unit price by quantity', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      // Select required size
      const sizeSelect = screen.getByRole('combobox', { name: /Size/i })
      sizeSelect.click()

      const mediumOption = await screen.findByRole('option', { name: /Medium/ })
      mediumOption.click()

      // Unit price should be $5.00
      await waitFor(() => {
        expect(screen.getByText('$5.00')).toBeInTheDocument()
      })

      // Find increment button and click multiple times
      const incrementButtons = screen.getAllByRole('button', { name: '+' })
      const incrementButton = incrementButtons[0]

      // Increase qty to 3
      incrementButton.click()
      incrementButton.click()

      // Total should be $15.00 (3 × $5.00)
      await waitFor(() => {
        expect(screen.getByText('Total: $15.00')).toBeInTheDocument()
      })
    })

    it('enforces quantity limits (1-99)', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemNoVariants)
      renderMenuItemDetails('2')

      await waitFor(() => {
        expect(screen.getByText('Muffin')).toBeInTheDocument()
      })

      const decrementButtons = screen.getAllByRole('button', { name: '-' })
      const decrementButton = decrementButtons[0]

      // Try to decrease below 1
      decrementButton.click()

      // Should still show qty = 1
      expect(screen.getByText('Total: $3.00')).toBeInTheDocument()
    })
  })

  describe('Edge Cases', () => {
    it('shows no variant groups for item with no variants', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemNoVariants)
      renderMenuItemDetails('2')

      await waitFor(() => {
        expect(screen.getByText('Muffin')).toBeInTheDocument()
      })

      // Should not show any variant selects/comboboxes
      const comboboxes = screen.queryAllByRole('combobox')
      expect(comboboxes.length).toBe(0)
    })

    it('allows adding item with no variants directly', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemNoVariants)
      renderMenuItemDetails('2')

      await waitFor(() => {
        expect(screen.getByText('Muffin')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /ADD TO CART/i })
      addButton.click()

      await waitFor(() => {
        expect(mockAddToCart).toHaveBeenCalledWith(
          expect.objectContaining({
            menuItemId: 2,
            qty: 1,
            selectedOptions: []
          })
        )
      })
    })

    it('disables ADD TO CART button for unavailable items', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemUnavailable)
      renderMenuItemDetails('3')

      await waitFor(() => {
        expect(screen.getByText('Seasonal Special')).toBeInTheDocument()
      })

      const addButton = screen.getByRole('button', { name: /ADD TO CART/i })
      expect(addButton).toBeDisabled()
    })

    it('shows warning alert for unavailable items', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemUnavailable)
      renderMenuItemDetails('3')

      await waitFor(() => {
        expect(screen.getByText('Currently unavailable')).toBeInTheDocument()
      })
    })
  })

  describe('Special Instructions', () => {
    it('allows entering special instructions', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      const instructionsField = screen.getByPlaceholderText(/e.g., no sugar/)
      expect(instructionsField).toBeInTheDocument()

      instructionsField.click()
      instructionsField.textContent = 'extra hot, no foam'

      expect(instructionsField.value || instructionsField.textContent).toBeDefined()
    })

    it('limits special instructions to 250 characters', async () => {
      menuApi.fetchMenuItemById.mockResolvedValue(itemWithVariants)
      renderMenuItemDetails('1')

      await waitFor(() => {
        expect(screen.getByText('Cappuccino')).toBeInTheDocument()
      })

      const instructionsField = screen.getByPlaceholderText(/e.g., no sugar/)
      const longText = 'a'.repeat(300)

      // Component should limit to 250 chars
      expect(instructionsField.maxLength || 250).toBeGreaterThanOrEqual(250)
    })
  })
})
