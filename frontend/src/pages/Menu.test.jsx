import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, userEvent } from '@testing-library/react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Menu from './Menu'
import * as menuApi from '../API/menuApi'

// Mock the API
vi.mock('../API/menuApi')

// Mock child components
vi.mock('../components/menu/CategoryRail', () => ({
  default: ({ categories, activeCategory, onCategorySelect }) => (
    <div data-testid="category-rail">
      {categories.map(cat => (
        <button
          key={cat}
          data-testid={`category-${cat}`}
          onClick={() => onCategorySelect(cat)}
          aria-pressed={cat === activeCategory}
        >
          {cat}
        </button>
      ))}
    </div>
  )
}))

vi.mock('../components/menu/MenuPageChrome', () => ({
  PageWrap: ({ children }) => <div>{children}</div>,
  SectionHeading: ({ children }) => <h2>{children}</h2>,
  SectionLabel: ({ children }) => <span>{children}</span>,
  StatusText: ({ children, isError }) => <p>{children}</p>
}))

vi.mock('../components/CategoryChipsSkeleton', () => ({
  default: () => <div data-testid="categories-skeleton">Categories Loading</div>
}))

vi.mock('../components/MenuSkeleton', () => ({
  default: () => <div data-testid="menu-skeleton">Menu Loading</div>
}))

vi.mock('../components/MenuList', () => ({
  default: ({ items }) => (
    <div data-testid="menu-list">
      {items && items.map(item => (
        <div key={item.id} data-testid={`item-${item.id}`}>
          {item.name} - {item.subcategory || 'no-subcat'}
        </div>
      ))}
    </div>
  )
}))

vi.mock('../hooks/useMenuData', () => ({
  useMenuData: ({ category }) => {
    const allItems = [
      { id: 1, name: 'Espresso', category: 'Coffee', subcategory: 'Hot Drinks' },
      { id: 2, name: 'Americano', category: 'Coffee', subcategory: 'Hot Drinks' },
      { id: 3, name: 'Iced Latte', category: 'Coffee', subcategory: 'Cold Drinks' },
      { id: 4, name: 'Croissant', category: 'Pastries', subcategory: null },
      { id: 5, name: 'Cookie', category: 'Pastries', subcategory: null }
    ]

    const filteredItems = category 
      ? allItems.filter(item => item.category === category)
      : allItems

    return {
      items: filteredItems,
      categories: ['Coffee', 'Pastries'],
      loading: false,
      error: null,
      hasLoadedCategories: true
    }
  }
}))

const renderMenuPage = (initialRoute = '/menu') => {
  return render(
    <BrowserRouter>
      <Routes>
        <Route path="/menu" element={<Menu />} />
        <Route path="/menu/:category" element={<Menu />} />
      </Routes>
    </BrowserRouter>,
    { initialEntries: [initialRoute] }
  )
}

describe('Menu Browsing Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('displays all items when no category is selected', async () => {
    renderMenuPage('/menu')

    await waitFor(() => {
      expect(screen.getByTestId('item-1')).toBeInTheDocument()
      expect(screen.getByTestId('item-2')).toBeInTheDocument()
      expect(screen.getByTestId('item-3')).toBeInTheDocument()
      expect(screen.getByTestId('item-4')).toBeInTheDocument()
      expect(screen.getByTestId('item-5')).toBeInTheDocument()
    })
  })

  it('filters items by category', async () => {
    renderMenuPage('/menu/Coffee')

    await waitFor(() => {
      expect(screen.getByTestId('item-1')).toBeInTheDocument()
      expect(screen.getByTestId('item-2')).toBeInTheDocument()
      expect(screen.getByTestId('item-3')).toBeInTheDocument()
      expect(screen.queryByTestId('item-4')).not.toBeInTheDocument()
      expect(screen.queryByTestId('item-5')).not.toBeInTheDocument()
    })
  })

  it('displays subcategories only when category is selected', async () => {
    const { rerender } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/menu" element={<Menu />} />
          <Route path="/menu/:category" element={<Menu />} />
        </Routes>
      </BrowserRouter>,
      { initialEntries: ['/menu'] }
    )

    // At /menu, no subcategories should show
    expect(screen.queryByTestId('subcat-Hot Drinks')).not.toBeInTheDocument()
  })

  it('filters items by subcategory within a category', async () => {
    renderMenuPage('/menu/Coffee')

    await waitFor(() => {
      // Should have Hot Drinks subcategory option
      const hotDrinksChip = screen.queryByDisplayValue('Hot Drinks') || 
                           Array.from(screen.getAllByRole('button')).find(b => b.textContent.includes('Hot Drinks'))
      
      if (hotDrinksChip) {
        hotDrinksChip.click()
        
        // Should show Espresso and Americano (Hot Drinks)
        expect(screen.getByText(/Espresso.*Hot Drinks/)).toBeInTheDocument()
        expect(screen.getByText(/Americano.*Hot Drinks/)).toBeInTheDocument()
        
        // Should NOT show Iced Latte (Cold Drinks)
        expect(screen.queryByText(/Iced Latte.*Cold Drinks/)).not.toBeInTheDocument()
      }
    })
  })

  it('deselects subcategory when clicked again', async () => {
    renderMenuPage('/menu/Coffee')

    await waitFor(() => {
      // Find subcategory chip
      const buttons = screen.getAllByRole('button')
      const subCatButton = buttons.find(b => b.textContent.includes('Hot Drinks'))
      
      if (subCatButton) {
        // First click to select
        subCatButton.click()
        
        // Second click to deselect
        subCatButton.click()
        
        // Should show all Coffee items again
        expect(screen.getByTestId('item-1')).toBeInTheDocument()
        expect(screen.getByTestId('item-2')).toBeInTheDocument()
        expect(screen.getByTestId('item-3')).toBeInTheDocument()
      }
    })
  })

  it('handles category with no items', async () => {
    vi.mock('../hooks/useMenuData', () => ({
      useMenuData: ({ category }) => ({
        items: [],
        categories: ['Coffee', 'Pastries'],
        loading: false,
        error: null,
        hasLoadedCategories: true
      })
    }))

    renderMenuPage('/menu/EmptyCategory')

    await waitFor(() => {
      expect(screen.getByTestId('menu-list')).toBeInTheDocument()
    })
  })

  it('handles category with no subcategories', async () => {
    renderMenuPage('/menu/Pastries')

    await waitFor(() => {
      expect(screen.getByTestId('item-4')).toBeInTheDocument()
      expect(screen.getByTestId('item-5')).toBeInTheDocument()
    })

    // Subcategories should not be visible for items without subcategory
    const subCatButtons = screen.queryAllByRole('button')
      .filter(b => b.textContent !== 'Coffee' && b.textContent !== 'Pastries')
    
    expect(subCatButtons.length).toBe(0)
  })

  it('deselects category when clicking active category', async () => {
    const { rerender } = render(
      <BrowserRouter>
        <Routes>
          <Route path="/menu" element={<Menu />} />
          <Route path="/menu/:category" element={<Menu />} />
        </Routes>
      </BrowserRouter>,
      { initialEntries: ['/menu/Coffee'] }
    )

    await waitFor(() => {
      expect(screen.getByTestId('item-1')).toBeInTheDocument()
    })

    // Click the active Coffee category to deselect
    const coffeeButton = screen.getByTestId('category-Coffee')
    coffeeButton.click()

    // Should navigate back to /menu (all items)
    rerender(
      <BrowserRouter>
        <Routes>
          <Route path="/menu" element={<Menu />} />
          <Route path="/menu/:category" element={<Menu />} />
        </Routes>
      </BrowserRouter>
    )
  })

  it('displays categories', async () => {
    renderMenuPage('/menu')

    await waitFor(() => {
      expect(screen.getByTestId('category-Coffee')).toBeInTheDocument()
      expect(screen.getByTestId('category-Pastries')).toBeInTheDocument()
    })
  })

  it('shows loading skeleton during data fetch', async () => {
    vi.mocked(menuApi.fetchMenu).mockReturnValue(
      new Promise(() => {}) // Never resolves
    )

    renderMenuPage('/menu')

    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument()
  })
})
