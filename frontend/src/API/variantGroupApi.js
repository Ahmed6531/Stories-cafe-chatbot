import http from './http'

function toApiError(error, fallbackMessage) {
  const next = new Error(error.response?.data?.error || fallbackMessage)
  next.status = error.response?.status || null
  next.data = error.response?.data || null
  return next
}

export async function fetchVariantGroupsByCategory(categoryId, { includeInactive = false } = {}) {
  try {
    const params = includeInactive ? "?includeInactive=true" : ""
    const response = await http.get(`/categories/${categoryId}/variant-groups${params}`)
    return response.data.groups || []
  } catch (error) {
    console.error(`Failed to fetch variant groups for category ${categoryId}:`, error)
    throw toApiError(error, 'Failed to load variant groups')
  }
}

export async function createVariantGroupForCategory(categoryId, data) {
  try {
    const response = await http.post(`/categories/${categoryId}/variant-groups`, data)
    return response.data.group
  } catch (error) {
    console.error('Failed to create variant group:', error)
    throw toApiError(error, 'Failed to create variant group')
  }
}

export async function updateVariantGroupForCategory(categoryId, groupId, data) {
  try {
    const response = await http.patch(`/categories/${categoryId}/variant-groups/${groupId}`, data)
    return response.data.group
  } catch (error) {
    console.error(`Failed to update variant group ${groupId}:`, error)
    throw toApiError(error, 'Failed to update variant group')
  }
}

export async function deleteVariantGroupForCategory(categoryId, groupId) {
  try {
    const response = await http.delete(`/categories/${categoryId}/variant-groups/${groupId}`)
    return response.data
  } catch (error) {
    console.error(`Failed to delete variant group ${groupId}:`, error)
    throw toApiError(error, 'Failed to delete variant group')
  }
}

export async function hardDeleteVariantGroupForCategory(categoryId, groupId, { cascade = false } = {}) {
  try {
    const params = new URLSearchParams({ hard: "true" })
    if (cascade) params.set("cascade", "true")
    const response = await http.delete(`/categories/${categoryId}/variant-groups/${groupId}?${params.toString()}`)
    return response.data
  } catch (error) {
    console.error(`Failed to hard delete variant group ${groupId}:`, error)
    throw toApiError(error, 'Failed to delete variant group permanently')
  }
}
