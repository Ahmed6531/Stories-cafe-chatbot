import http from './http'

let categoriesCache = null
let categoriesRequest = null

/**
 * Transform backend menu item to frontend format
 */
function transformMenuItem(item) {
  if (!item.id || !item.name) return null;
  const hasImage = Boolean(item.image && String(item.image).trim());
  return {
    id: item.id,
    name: item.name,
    description: item.description,
    price: item.price || item.basePrice || 0,
    basePrice: item.basePrice || item.price || 0,
    category: item.category,
    subcategory: item.subcategory || null,
    slug: item.slug || null,
    // null instead of '/images/placeholder.png' — that file doesn't exist and
    // causes a wasted 404 request. All three customer components (MenuItem,
    // MenuItemDetails, CartSummary) already render an inline SVG fallback when
    // image is null or falsy.
    image: item.image || null,
    hasImage,
    isAvailable: item.isAvailable !== undefined ? item.isAvailable : true,
    isFeatured: item.isFeatured || false,
    options: item.options || [],
    variantGroups: item.variantGroups || [],
    variants: (item.variants || []).map(v => ({
      ...v,
      id: v.groupId || v.id
    })).sort((a, b) => (a.order ?? 999) - (b.order ?? 999)),
  }
}

export async function fetchMenuCategories() {
  if (categoriesCache) {
    return categoriesCache
  }

  if (!categoriesRequest) {
    categoriesRequest = http.get('/menu/categories')
      .then((response) => {
        categoriesCache = response.data.categories || []
        return categoriesCache
      })
      .finally(() => {
        categoriesRequest = null
      })
  }

  return categoriesRequest
}

/**
 * Fetch menu items plus backend-provided category metadata.
 * @returns {Promise<Object>} Menu data with items and categories
 */
export async function fetchMenu(category) {
  try {
    if (!category) {
      const [categories, response] = await Promise.all([
        fetchMenuCategories(),
        http.get('/menu'),
      ])
      const allItems = response.data.items || []
      return {
        items: allItems.map(transformMenuItem).filter(Boolean),
        categories,
      }
    }

    const [categories, response] = await Promise.all([
      fetchMenuCategories(),
      http.get(`/menu/category/${encodeURIComponent(category)}`),
    ])
    const items = (response.data.items || []).map(transformMenuItem).filter(Boolean)
    return { items, categories }
  } catch (error) {
    console.error('Failed to fetch menu:', error)
    throw new Error(error.response?.data?.error || 'Failed to load menu');
  }
}

/**
 * Fetch featured menu items from backend API.
 * @returns {Promise<Array>} Featured menu items
 */
export async function fetchFeaturedMenu() {
  try {
    const response = await http.get('/menu/featured')
    return (response.data.items || []).map(transformMenuItem).filter(Boolean)
  } catch (error) {
    console.error('Failed to fetch featured menu:', error)
    throw new Error(error.response?.data?.error || 'Failed to load featured menu')
  }
}

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

/**
 * Admin-only: Create a new menu item.
 * Slug is NOT sent — the backend auto-generates it from name.
 */
export async function createMenuItem(data) {
  try {
    const response = await http.post("/menu", data);
    return transformMenuItem(response.data.item || response.data);
  } catch (error) {
    console.error("Failed to create menu item:", error);
    throw new Error(error.response?.data?.error || "Failed to create menu item");
  }
}

/**
 * Admin-only: Upload an image for a menu item.
 * Called after createMenuItem or to replace an existing image.
 *
 * No Content-Type header is set — axios detects FormData and lets the browser
 * set the full multipart/form-data header including the boundary automatically.
 * Setting it manually strips the boundary and breaks multer parsing.
 *
 * @param {number|string} id   - Numeric item ID returned by createMenuItem
 * @param {File}          file - Browser File selected via <input type="file">
 * @returns {Promise<{ success: boolean, imageUrl: string, item: object }>}
 */
export async function uploadMenuItemImage(id, file) {
  try {
    const formData = new FormData()
    formData.append("image", file)
    // null explicitly removes the instance-level "application/json" default for
    // this request — axios v1.x then lets the browser set the correct
    // multipart/form-data + boundary header automatically
    const response = await http.post(`/menu/${id}/image`, formData, {
      headers: { "Content-Type": null },
    })
    return response.data
  } catch (error) {
    console.error(`Failed to upload image for menu item ${id}:`, error)
    throw new Error(error.response?.data?.error || "Failed to upload image")
  }
}

/**
 * Admin-only: Update a menu item by ID.
 * Slug is NOT sent — backend regenerates it automatically if name changes.
 */
export async function updateMenuItem(id, data) {
  console.log("→ Sending PATCH request for id:", id, "data:", data);
  try {
    const response = await http.patch(`/menu/${id}`, data);
    return transformMenuItem(response.data.item || response.data);
  } catch (error) {
    console.error(`Failed to update menu item ${id}:`, error);
    throw new Error(error.response?.data?.error || "Failed to update menu item");
  }
}

/**
 * Admin-only: Delete a menu item by ID.
 * The backend also deletes the image file from disk automatically.
 */
export async function deleteMenuItem(id) {
  try {
    const response = await http.delete(`/menu/${id}`);
    return response.data;
  } catch (error) {
    console.error(`Failed to delete menu item ${id}:`, error);
    throw new Error(error.response?.data?.error || "Failed to delete menu item");
  }
}