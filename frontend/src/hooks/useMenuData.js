import { useEffect, useState } from 'react'
import { fetchMenu } from '../API/menuApi'

export function useMenuData({
  category,
  errorMessage,
  preserveDataOnError = true,
  logErrors = false,
} = {}) {
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [hasLoadedCategories, setHasLoadedCategories] = useState(false)

  useEffect(() => {
    let active = true

    const loadMenu = async () => {
      try {
        setLoading(true)
        const data = await fetchMenu(category)
        if (!active) return
        setItems(data.items)
        setCategories(data.categories)
        setError(null)
        setHasLoadedCategories(true)
      } catch (err) {
        if (!active) return
        if (logErrors) {
          console.error(err)
        }
        setError(errorMessage || err.message || 'Failed to load menu')
        if (!preserveDataOnError) {
          setItems([])
          setCategories([])
        }
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    loadMenu()

    return () => {
      active = false
    }
  }, [category, errorMessage, preserveDataOnError, logErrors])

  return {
    items,
    categories,
    loading,
    error,
    hasLoadedCategories,
  }
}
