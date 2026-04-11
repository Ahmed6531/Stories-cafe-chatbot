import http from './http'

export async function fetchCategories({ includeInactive = false } = {}) {
  try {
    const params = includeInactive ? '?includeInactive=true' : ''
    const response = await http.get(`/categories${params}`)
    return response.data.categories || []
  } catch (error) {
    console.error('Failed to fetch categories:', error)
    throw new Error(error.response?.data?.error || 'Failed to load categories')
  }
}

export async function fetchCategoryBySlug(slug) {
  try {
    const response = await http.get(`/categories/slug/${slug}`)
    return response.data.category
  } catch (error) {
    console.error(`Failed to fetch category "${slug}":`, error)
    throw new Error(error.response?.data?.error || 'Failed to load category')
  }
}

export async function createCategory(data) {
  try {
    const response = await http.post('/categories', data)
    return response.data.category
  } catch (error) {
    console.error('Failed to create category:', error)
    throw new Error(error.response?.data?.error || 'Failed to create category')
  }
}

export async function updateCategory(id, data) {
  try {
    const response = await http.patch(`/categories/${id}`, data)
    return response.data.category
  } catch (error) {
    console.error(`Failed to update category ${id}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to update category')
  }
}

export async function deleteCategory(id) {
  try {
    const response = await http.delete(`/categories/${id}`)
    return response.data
  } catch (error) {
    console.error(`Failed to delete category ${id}:`, error)
    throw new Error(error.response?.data?.error || 'Failed to delete category')
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
    throw new Error(error.response?.data?.error || "Failed to upload category image")
  }
}
