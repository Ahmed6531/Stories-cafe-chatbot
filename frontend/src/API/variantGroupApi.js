import http from './http'

/**
 * Fetch all variant groups, sorted by adminName.
 * @returns {Promise<Array>} Array of variant group objects
 */
// Global list — kept for backward compat with the legacy admin page.
export async function fetchVariantGroups() {
  try {
    const response = await http.get('/variant-groups')
    return response.data.groups || []
  } catch (error) {
    console.error('Failed to fetch variant groups:', error)
    throw new Error(error.response?.data?.error || 'Failed to load variant groups')
  }
}

// Category-scoped list — prefer this for the item form and admin categories page.
export async function fetchVariantGroupsByCategory(categoryId) {
  try {
    const response = await http.get(`/categories/${categoryId}/variant-groups`)
    return response.data.groups || []
  } catch (error) {
    console.error(`Failed to fetch variant groups for category ${categoryId}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to load variant groups')
  }
}

// Admin: create a variant group scoped to a category.
export async function createVariantGroupForCategory(categoryId, data) {
  try {
    const response = await http.post(`/categories/${categoryId}/variant-groups`, data)
    return response.data.group
  } catch (error) {
    console.error('Failed to create variant group:', error)
    throw new Error(error.response?.data?.error || 'Failed to create variant group')
  }
}

// Admin: update a variant group (scoped or flat route both work).
export async function updateVariantGroupForCategory(categoryId, groupId, data) {
  try {
    const response = await http.patch(`/categories/${categoryId}/variant-groups/${groupId}`, data)
    return response.data.group
  } catch (error) {
    console.error(`Failed to update variant group ${groupId}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to update variant group')
  }
}

// Admin: soft-delete a variant group (scoped route).
export async function deleteVariantGroupForCategory(categoryId, groupId) {
  try {
    const response = await http.delete(`/categories/${categoryId}/variant-groups/${groupId}`)
    return response.data
  } catch (error) {
    console.error(`Failed to delete variant group ${groupId}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to delete variant group')
  }
}

/**
 * Admin-only: Create a new variant group.
 * groupId is auto-generated server-side from adminName.
 *
 * @param {{ adminName, customerLabel, isRequired, maxSelections, options[] }} data
 */
export async function createVariantGroup(data) {
  try {
    const response = await http.post('/variant-groups', data)
    return response.data.group
  } catch (error) {
    console.error('Failed to create variant group:', error)
    throw new Error(error.response?.data?.error || 'Failed to create variant group')
  }
}

/**
 * Admin-only: Update a variant group by groupId.
 *
 * @param {string} groupId
 * @param {{ adminName?, customerLabel?, isRequired?, maxSelections?, options[]? }} data
 */
export async function updateVariantGroup(groupId, data) {
  try {
    const response = await http.patch(`/variant-groups/${groupId}`, data)
    return response.data.group
  } catch (error) {
    console.error(`Failed to update variant group ${groupId}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to update variant group')
  }
}

/**
 * Admin-only: Delete a variant group by groupId.
 *
 * @param {string} groupId
 */
export async function deleteVariantGroup(groupId) {
  try {
    const response = await http.delete(`/variant-groups/${groupId}`)
    return response.data
  } catch (error) {
    console.error(`Failed to delete variant group ${groupId}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to delete variant group')
  }
}
