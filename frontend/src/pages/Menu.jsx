import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import MenuList from '../components/MenuList'
import { fetchMenu } from '../API/menuApi'
import '../styles/menu.css'

export default function Menu() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') || 'All'
  const [items, setItems] = useState([])
  const [categories, setCategories] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Fetch menu data on component mount
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true)
        const data = await fetchMenu()
        setItems(data.items)
        setCategories(data.categories)
        setError(null)
      } catch (err) {
        setError(err.message)
        console.error(err)
      } finally {
        setLoading(false)
      }
    }

    loadMenu()
  }, [])

  // Filter items by selected category, skip items missing slug or name (should already be filtered in API, but double check)
  const filteredItems = useMemo(() => {
    const validItems = items.filter((i) => i && i.slug && i.name)
    if (category === 'All') return validItems
    return validItems.filter((i) => i.category === category)
  }, [items, category])

  if (error) {
    return (
      <div className="page-wrap" style={{ textAlign: 'center' }}>
        <h1 className="menu-title">Menu</h1>
        <p style={{ color: '#d32f2f' }}>Error: {error}</p>
        <button
          type="button"
          className="primary-btn"
          onClick={() => window.location.reload()}
          style={{ marginTop: '20px' }}
        >
          Retry
        </button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page-wrap" style={{ textAlign: 'center' }}>
        <h1 className="menu-title">Menu</h1>
        <p>Loading menu...</p>
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <div className="menu-header">
        <h1 className="menu-title">Menu</h1>
        <p className="menu-subtitle">Browse items by category</p>
      </div>

      <h2 className="section-title">CATEGORIES</h2>
      <div className="catbar">
        <button 
          type="button" 
          className={`cat-chip ${category === 'All' ? 'active' : ''}`}
          onClick={() => setParams({ category: 'All' })}
        >
          All
        </button>
        {categories.length > 0 ? (
          categories.map((c) => (
            <button 
              key={c} 
              type="button" 
              className={`cat-chip ${category === c ? 'active' : ''}`}
              onClick={() => setParams({ category: c })}
            >
              {c}
            </button>
          ))
        ) : (
          <span>No categories found.</span>
        )}
      </div>

      <MenuList items={filteredItems} />
    </div>
  )
}
