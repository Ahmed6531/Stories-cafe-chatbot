import { NavLink, Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import { useMemo, useState, useEffect } from 'react'
import { useCart } from '../state/useCart'
import { fetchMenuItemById } from '../API/menuApi'
import '../styles/index.css'

function useBreadcrumb() {
  const location = useLocation()
  const [item, setItem] = useState(null)
  const [prevCategory, setPrevCategory] = useState(null)

  useEffect(() => {
    // Update prevCategory when location changes
    if (location.pathname === '/menu') {
      const params = new URLSearchParams(location.search)
      const category = params.get('category')
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPrevCategory(category && category !== 'All' ? category : null)
    }
  }, [location.pathname, location.search])

  useEffect(() => {
    const fetchItem = async () => {
      if (location.pathname.startsWith('/item/')) {
        const id = location.pathname.split('/item/')[1]
        if (id) {
          try {
            const data = await fetchMenuItemById(id)
            setItem(data)
          } catch (err) {
            console.error('Failed to fetch item for breadcrumb:', err)
            setItem(null)
          }
        }
      } else {
        setItem(null)
      }
    }
    fetchItem()
  }, [location.pathname])

  return useMemo(() => {
    const crumbs = [{ label: 'Home', to: '/' }]
    const params = new URLSearchParams(location.search)

    if (location.pathname.startsWith('/menu')) {
      crumbs.push({ label: 'Menu', to: '/menu' })
      const category = params.get('category')
      if (category && category !== 'All') {
        crumbs.push({ label: category, to: `/menu?category=${encodeURIComponent(category)}` })
      }
    }

    if (location.pathname.startsWith('/cart')) crumbs.push({ label: 'Cart', to: '/cart' })
    if (location.pathname.startsWith('/login')) crumbs.push({ label: 'Login', to: '/login' })
    if (location.pathname.startsWith('/register')) crumbs.push({ label: 'Register', to: '/register' })

    // Item details: show category and item name in breadcrumb
    if (location.pathname.startsWith('/item/')) {
      crumbs.push({ label: 'Menu', to: '/menu' })
      if (item) {
        crumbs.push({ label: item.category, to: `/menu?category=${encodeURIComponent(item.category)}` })
        crumbs.push({ label: item.name, to: location.pathname })
      } else {
        if (prevCategory) {
          crumbs.push({ label: prevCategory, to: `/menu?category=${encodeURIComponent(prevCategory)}` })
        } else {
          crumbs.push({ label: '---', to: '#' })
        }
        crumbs.push({ label: '---', to: '#' })
      }
    }

    return crumbs
  }, [location.pathname, location.search, item, prevCategory])
}

export default function Navbar() {
  const [isAuthed] = useState(false) // demo toggle - whether user is logged in
  const { cartCount } = useCart() // TODO: cartCount is static (always 0), revert to dynamic if needed
  const crumbs = useBreadcrumb()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="app-shell">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-top">
          <nav className="side-nav">
            <NavLink to="/" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>Home</NavLink>
            <NavLink to="/menu" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>Menu</NavLink>
            {/* TODO: Cart link is static navigation only, no state; revert by ensuring cart state logic if dynamic cart needed */}
            <NavLink to="/cart" className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}>Cart</NavLink>

            {isAuthed && (
              <button className="side-link past-orders-btn" type="button" onClick={() => navigate('/orders')}>
                📋 Past Orders
              </button>
            )}
          </nav>
        </div>

        <div className="sidebar-bottom" />
      </aside>

      {/* Main */}
      <main className="main">
        {/* Top bar */}
        <header className="topbar">
                  <button
          className="hamburger-btn"
          onClick={() => setMobileOpen(true)}
        >
          ☰
        </button>
          <div className="logo-box">
            <img
              className="logo-img"
              src="/stories-logo.png"
              alt="Stories"
              onError={(e) => { e.currentTarget.style.display = 'none' }}
            />
          </div>

          <div className="topbar-actions">
            {isAuthed && (
              <button className="top-pill auth" type="button" onClick={() => navigate(-1)}>
                ← Back
              </button>
            )}
            {!isAuthed && (
              <button className="top-pill auth" type="button" onClick={() => navigate('/login')}>
                Login
              </button>
            )}
            {/* TODO: Cart button is static (badge always 0), revert by restoring dynamic cartCount and state logic */}
            <button className="top-pill outline" type="button" onClick={() => navigate('/cart')}>
              Cart <span className="cart-badge">{cartCount}</span>
            </button>
          </div>
        </header>

        {/* Breadcrumb (show when not Home) */}
        {location.pathname !== '/' && (
          <div className="breadcrumb">
            {crumbs.map((c, idx) => (
              <span key={c.to + idx} className="crumb">
                <Link to={c.to} className="crumb-link">{c.label}</Link>
                {idx < crumbs.length - 1 ? <span className="crumb-sep">/</span> : null}
              </span>
            ))}
          </div>
        )}

        <div className="page">
          <Outlet />
        </div>
      </main>
      {/* Mobile Drawer */}
      {mobileOpen && (
        <>
          <div
            className="mobile-overlay"
            onClick={() => setMobileOpen(false)}
          />

          <div className="mobile-drawer">
            <div className="mobile-drawer-header">
              <span>Menu</span>
              <button onClick={() => setMobileOpen(false)}>✕</button>
            </div>

            <nav className="mobile-nav">
              <NavLink to="/" onClick={() => setMobileOpen(false)}>Home</NavLink>
              <NavLink to="/menu" onClick={() => setMobileOpen(false)}>Menu</NavLink>
              <NavLink to="/cart" onClick={() => setMobileOpen(false)}>Cart</NavLink>
            </nav>
          </div>
        </>
      )}
    </div>
  )
}
