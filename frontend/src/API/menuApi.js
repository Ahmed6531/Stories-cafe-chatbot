import http from './http'

/**
 * Transform backend menu item to frontend format
 */
function transformMenuItem(item) {
  // Skip items missing slug or name (robustness for partial backend data)
  if (!item.slug || !item.name) return null;
  return {
    slug: item.slug,
    name: item.name,
    description: item.description,
    price: item.price || item.basePrice || 0,
    basePrice: item.basePrice || item.price || 0,
    category: item.category,
    image: item.image || `https://via.placeholder.com/260x260?text=${encodeURIComponent(item.name)}`,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isFeatured: item.isFeatured || false,
    options: item.options || [],
  }
}

/**
 * Fetch menu items from backend API
 * @returns {Promise<Object>} Menu data with items and extracted categories
 */
export async function fetchMenu() {
  try {
    console.log("👉 Calling GET /menu")
    const response = await http.get('/menu')
    console.log("✅ Menu response:", response.data)
    const { items } = response.data

    // Transform items to frontend format, filter out nulls (skipped items)
    const transformedItems = items.map(transformMenuItem).filter(Boolean)

    // Extract unique categories from items
    const categoriesSet = new Set(
      transformedItems.map((item) => item.category).filter(Boolean)
    )
    const categories = Array.from(categoriesSet).sort()

    return {
      items: transformedItems,
      categories,
    }
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    throw new Error(error.response?.data?.error || 'Failed to load menu')
  }
}

/**
/**
 * Get a single menu item by slug
 * @param {string} slug - Menu item slug
 * @returns {Promise<Object>} Menu item
 */
export async function fetchMenuItemBySlug(slug) {
  try {
    const response = await http.get(`/menu/${slug}`)
    const item = response.data?.item
    return transformMenuItem(item)
  } catch (error) {
    console.error(`Failed to fetch menu item ${slug}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to load menu item')
  }
}

