import http from './http'

function toApiError(error, fallbackMessage) {
  const next = new Error(error.response?.data?.error || fallbackMessage)
  next.status = error.response?.status || null
  next.data = error.response?.data || null
  return next
}

export async function fetchCategories({ includeInactive = false } = {}) {
  try {
    const params = includeInactive ? '?includeInactive=true' : ''
    const response = await http.get(`/categories${params}`)
    return response.data.categories || []
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    throw toApiError(error, 'Failed to load categories')
  }
}

export async function fetchCategoryBySlug(slug) {
  try {
    const response = await http.get(`/categories/slug/${slug}`)
    return response.data.category
  } catch (error) {
    console.error(`Failed to fetch category "${slug}":`, error)
    throw toApiError(error, 'Failed to load category')
  }
}

export async function createCategory(data) {
  try {
    const response = await http.post('/categories', data)
    return response.data.category
  } catch (error) {
    console.error('Failed to create category:', error)
    throw toApiError(error, 'Failed to create category')
  }
}

export async function updateCategory(id, data) {
  try {
    const response = await http.patch(`/categories/${id}`, data)
    return response.data.category
  } catch (error) {
    console.error(`Failed to update category ${id}:`, error)
    throw toApiError(error, 'Failed to update category')
  }
}

export async function deleteCategory(id, { cascade = false } = {}) {
  try {
    const params = new URLSearchParams()
    if (cascade) params.set("cascade", "true")
    const suffix = params.toString() ? `?${params.toString()}` : ""
    const response = await http.delete(`/categories/${id}${suffix}`)
    return response.data
  } catch (error) {
    console.error(`Failed to delete category ${id}:`, error)
    throw toApiError(error, 'Failed to delete category')
  }
}

export async function uploadCategoryImage(id, file) {
  try {
    const formData = new FormData()
    formData.append("image", file)
    const response = await http.post(`/categories/${id}/image`, formData, {
      headers: { "Content-Type": null },
    })
    return response.data
  } catch (error) {
    console.error(`Failed to upload image for category ${id}:`, error)
    throw toApiError(error, "Failed to upload category image")
  }
}
