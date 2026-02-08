import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FeaturedItems from '../components/FeaturedItems'
import { fetchMenu } from '../API/menuApi'
import '../styles/menu.css'

export default function Home() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch menu data on component mount
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true)
        setError(null)
        const data = await fetchMenu()
        setItems(data.items)
        setCategories(data.categories)
      } catch {
        setError('Failed to load menu. Please try again later.')
        setItems([])
        setCategories([])
      } finally {
        setLoading(false)
      }
    }
    loadMenu()
  }, [])

  const featured = useMemo(() => {
    return items.filter((i) => i.isFeatured)
  }, [items])

  const pickCategory = (c) => {
    navigate(`/menu?category=${encodeURIComponent(c)}`)
  }

  return (
    <div className="page-wrap">
      <h2 className="section-title">CATEGORIES</h2>
      <div className="catbar">
        {loading ? (
          <span>Loading categories...</span>
        ) : error ? (
          <span className="error">{error}</span>
        ) : categories.length > 0 ? (
          categories.map((c) => (
            <button key={c} type="button" className="cat-chip" onClick={() => pickCategory(c)}>
              {c}
            </button>
          ))
        ) : (
          <span>No categories found.</span>
        )}
      </div>

      <h2 className="section-title">FEATURED ITEMS</h2>
      {loading ? (
        <p>Loading featured items...</p>
      ) : error ? (
        <p className="error">{error}</p>
      ) : featured.length > 0 ? (
        <FeaturedItems items={featured} />
      ) : (
        <p>No featured items available.</p>
      )}
    </div>
  )
}
