import { Routes, Route, Navigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import Home from '../pages/Home.jsx'
import Menu from '../pages/Menu.jsx'
import Cart from '../pages/Cart.jsx'
import Checkout from '../pages/Checkout.jsx'
import Success from '../pages/Success.jsx'
import Login from '../pages/Login.jsx'
import Register from '../pages/Register.jsx'
import MenuItemDetails from '../pages/MenuItemDetails.jsx'

// Layout wrapper: Navbar contains sidebar + top header + breadcrumb
function Layout() {
  return <Navbar />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/success" element={<Success />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Item selected page */}
        <Route path="/item/:id" element={<MenuItemDetails />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
