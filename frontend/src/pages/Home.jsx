import { useMemo, useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import FeaturedItems from '../components/FeaturedItems'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import { fetchMenu } from '../API/menuApi'
import '../styles/menu.css'

export default function Home() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Category image mapping
  const categoryImages = {
    'Coffee': '/images/coffee.png',
    'Mixed Beverages': '/images/mixedbev.png',
    'Pastries': '/images/pastries.png',
    'Salad': '/images/salad.png',
    'Sandwiches': '/images/sandwiches.png',
    'Soft Drinks': '/images/soft-drinks.png',
    'Tea': '/images/tea.png',
    'Yogurts': '/images/yogurt.png'
  }

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
      <div className="section-heading">
        <h2 className="section-title">Categories</h2>
      </div>
      {loading ? (
        <CategoryChipsSkeleton />
      ) : error ? (
        <span className="state-text error">{error}</span>
      ) : categories.length > 0 ? (
        <div className="catbar-wrap">
          <div className="catbar">
            <div className="catbar-inner">
              {categories.map((c) => (
                <button key={c} type="button" className="cat-chip" onClick={() => pickCategory(c)}>
                  <div className="cat-chip-content">
                    <img
                      src={categoryImages[c] || '/images/placeholder.png'}
                      alt={c}
                      className="cat-chip-image"
                    />
                    <span className="cat-chip-text">{c === 'Mixed Beverages' ? 'Mixed Bev.' : c}</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <span>No categories found.</span>
      )}

      <div className="section-heading">
        <h2 className="section-title">Featured items</h2>
      </div>
      {loading ? (
        <MenuSkeleton />
      ) : error ? (
        <p className="state-text error">{error}</p>
      ) : featured.length > 0 ? (
        <FeaturedItems items={featured} />
      ) : (
        <p>No featured items available.</p>
      )}
    </div>
  )
}
