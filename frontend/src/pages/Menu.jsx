import { useMemo, useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import MenuList from '../components/MenuList'
import MenuSkeleton from '../components/MenuSkeleton'
import CategoryChipsSkeleton from '../components/CategoryChipsSkeleton'
import { fetchMenu } from '../API/menuApi'
import '../styles/menu.css'

export default function Menu() {
  const [params, setParams] = useSearchParams()
  const category = params.get('category') // No default - falsy means show all
  const [subcategory, setSubcategory] = useState(null)
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

  // Handle category selection - clicking active category deselects it
  const handleCategoryClick = (selectedCategory) => {
    if (category === selectedCategory) {
      // Clicking active category - show all items
      setParams({})
    } else {
      // Clicking different category - filter by it
      setParams({ category: selectedCategory })
    }
  }

  // Fetch menu data on component mount
  useEffect(() => {
    const loadMenu = async () => {
      try {
        setLoading(true);
        const data = await fetchMenu(category);
        setItems(data.items);
        setCategories(data.categories);
        setError(null);
      } catch (err) {
        setError(err.message);
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    loadMenu();
  }, [category]);

  useEffect(() => {
    setSubcategory(null)
  }, [category])

  const subcategories = useMemo(() => {
    if (!category) return []
    const uniqueSubcategories = new Set(
      items.map((item) => item.subcategory).filter(Boolean)
    )
    return Array.from(uniqueSubcategories).sort()
  }, [items, category])

  // Items are already filtered by backend category; this applies optional subcategory filtering
  const filteredItems = useMemo(() => {
    return items.filter((i) => {
      if (!i || !i.id || !i.name) return false
      if (!subcategory) return true
      return i.subcategory === subcategory
    })
  }, [items, subcategory])

  if (error) {
    return (
      <div className="page-wrap state-wrap">
        <h1 className="state-title">Unable to load menu</h1>
        <p className="state-text error">Error: {error}</p>
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
      <div className="page-wrap">
        <div className="section-heading">
          <h2 className="section-title">Categories</h2>
        </div>
        <CategoryChipsSkeleton />
        <MenuSkeleton />
      </div>
    )
  }

  return (
    <div className="page-wrap">
      <div className="section-heading">
        <h2 className="section-title">Categories</h2>
      </div>
      <div className="catbar">
        {categories.length > 0 ? (
          categories.map((c) => (
            <button 
              key={c} 
              type="button" 
              className={`cat-chip ${category === c ? 'active' : ''}`}
              onClick={() => handleCategoryClick(c)}
            >
              <div className="cat-chip-content">
                <img 
                  src={categoryImages[c] || '/images/placeholder.png'} 
                  alt={c} 
                  className="cat-chip-image" 
                />
                <span className="cat-chip-text">{c}</span>
              </div>
            </button>
          ))
        ) : (
          <span>No categories found.</span>
        )}
      </div>

      {subcategories.length > 0 && (
        <div className="subcatbar">
          {subcategories.map((s) => (
            <button
              key={s}
              type="button"
              className={`subcat-chip ${subcategory === s ? 'active' : ''}`}
              onClick={() => setSubcategory((prev) => (prev === s ? null : s))}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <MenuList items={filteredItems} />
    </div>
  )
}
