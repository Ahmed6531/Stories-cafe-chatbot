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
  }
}

/**
 * Fetch menu items from backend API
 * @returns {Promise<Object>} Menu data with items and extracted categories
 */
export async function fetchMenu(category) {
  try {
    let itemsUrl = '/menu';
    if (category) {
      itemsUrl = `/menu/category/${encodeURIComponent(category)}`;
    }
    // Always fetch all categories for the category bar
    const categoriesResponse = await http.get('/menu');
    const allItems = categoriesResponse.data.items || [];
    const categoriesSet = new Set(
      allItems.map((item) => item.category).filter(Boolean)
    );
    const categories = Array.from(categoriesSet).sort();

    // Fetch filtered items if category is selected, else use all
    let items = allItems;
    if (category) {
      const filteredResponse = await http.get(itemsUrl);
      items = filteredResponse.data.items || [];
    }
    const transformedItems = items.map(transformMenuItem).filter(Boolean);
    return {
      items: transformedItems,
      categories,
    };
  } catch (error) {
    console.error('Failed to fetch menu:', error);
    throw new Error(error.response?.data?.error || 'Failed to load menu');
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

