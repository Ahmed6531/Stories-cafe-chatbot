import http from './http'

/**
 * Transform backend menu item to frontend format
 */
function transformMenuItem(item) {
  // Skip items missing id or name (robustness for partial backend data)
  if (!item.id || !item.name) return null;
  return {
    id: item.id,  // Use the numeric ID from the database
    name: item.name,
    description: item.description,
    price: item.price || item.basePrice || 0,
    basePrice: item.basePrice || item.price || 0,
    category: item.category,
    image: item.image || `https://via.placeholder.com/260x260?text=${encodeURIComponent(item.name)}`,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isFeatured: item.isFeatured || false,
    options: item.options || [],
    variantGroups: item.variantGroups || [],
    variants: (item.variants || []).map(v => ({
      ...v,
      id: v.groupId || v.id // Map groupId to id for frontend compatibility
    })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
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
 * Get a single menu item by ID
 * @param {string} id - Menu item ID
 * @returns {Promise<Object>} Menu item
 */
export async function fetchMenuItemById(id) {
  try {
    const response = await http.get(`/menu/${id}`)
    const item = response.data?.item
    return transformMenuItem(item)
  } catch (error) {
    console.error(`Failed to fetch menu item ${id}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to load menu item')
  }
}

