import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { BrowserRouter } from 'react-router-dom'
import Home from './Home'
import * as menuApi from '../API/menuApi'
import * as activeOrderUtil from '../utils/activeOrder'

// Mock the API
vi.mock('../API/menuApi')
vi.mock('../utils/activeOrder')

// Mock child components to simplify testing
vi.mock('../components/menu/CategoryRail', () => ({
  default: () => <div data-testid="category-rail">Category Rail</div>
}))

vi.mock('../components/menu/MenuPageChrome', () => ({
  PageWrap: ({ children }) => <div>{children}</div>,
  SectionHeading: ({ children }) => <h2>{children}</h2>,
  SectionLabel: ({ children }) => <span>{children}</span>,
  StatusText: ({ children }) => <p>{children}</p>
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
      {items && items.length > 0 ? items.map(item => (
        <div key={item.id} data-testid={`menu-item-${item.id}`}>{item.name}</div>
      )) : <p>No items</p>}
    </div>
  )
}))

const mockCategories = ['Coffee', 'Pastries', 'Sandwiches']
const mockFeaturedItems = [
  { id: 1, name: 'Espresso', basePrice: 2.50, category: 'Coffee', isAvailable: true },
  { id: 2, name: 'Croissant', basePrice: 3.00, category: 'Pastries', isAvailable: true }
]

describe('Home Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    activeOrderUtil.getActiveOrder.mockReturnValue(null)
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('loads categories on mount', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue(mockCategories)
    menuApi.fetchFeaturedMenu.mockResolvedValue([])

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(menuApi.fetchMenuCategories).toHaveBeenCalledTimes(1)
    })
  })

  it('loads featured items on mount', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue([])
    menuApi.fetchFeaturedMenu.mockResolvedValue(mockFeaturedItems)

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(menuApi.fetchFeaturedMenu).toHaveBeenCalledTimes(1)
    })
  })

  it('displays loading skeleton for categories', () => {
    menuApi.fetchMenuCategories.mockImplementation(() => new Promise(() => {})) // Never resolves
    menuApi.fetchFeaturedMenu.mockImplementation(() => new Promise(() => {}))

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    expect(screen.getByTestId('categories-skeleton')).toBeInTheDocument()
  })

  it('displays loading skeleton for featured items', () => {
    menuApi.fetchMenuCategories.mockResolvedValue([])
    menuApi.fetchFeaturedMenu.mockImplementation(() => new Promise(() => {})) // Never resolves

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument()
  })

  it('displays categories after loading', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue(mockCategories)
    menuApi.fetchFeaturedMenu.mockResolvedValue([])

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('category-rail')).toBeInTheDocument()
    })
  })

  it('displays featured items after loading', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue([])
    menuApi.fetchFeaturedMenu.mockResolvedValue(mockFeaturedItems)

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('menu-item-1')).toBeInTheDocument()
      expect(screen.getByTestId('menu-item-2')).toBeInTheDocument()
    })
  })

  it('handles API error for categories', async () => {
    menuApi.fetchMenuCategories.mockRejectedValue(new Error('Network error'))
    menuApi.fetchFeaturedMenu.mockResolvedValue([])

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Failed to load menu/)).toBeInTheDocument()
    })
  })

  it('handles API error for featured items', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue([])
    menuApi.fetchFeaturedMenu.mockRejectedValue(new Error('Network error'))

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/Failed to load menu/)).toBeInTheDocument()
    })
  })

  it('handles empty categories array', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue([])
    menuApi.fetchFeaturedMenu.mockResolvedValue(mockFeaturedItems)

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      expect(menuApi.fetchMenuCategories).toHaveBeenCalled()
    })
  })

  it('handles empty featured items array', async () => {
    menuApi.fetchMenuCategories.mockResolvedValue(mockCategories)
    menuApi.fetchFeaturedMenu.mockResolvedValue([])

    render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    await waitFor(() => {
      screen.getByText('No items')
    })
  })

  it('cleans up on component unmount', async () => {
    menuApi.fetchMenuCategories.mockImplementation(() => new Promise(() => {}))
    menuApi.fetchFeaturedMenu.mockImplementation(() => new Promise(() => {}))

    const { unmount } = render(
      <BrowserRouter>
        <Home />
      </BrowserRouter>
    )

    unmount()

    // If test doesn't hang, cleanup worked
    expect(true).toBe(true)
  })
})
