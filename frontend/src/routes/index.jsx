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
import Dashboard from '../pages/Dashboard.jsx'
import AdminLayout from "../components/admin/AdminLayout"
import AdminDashboard from "../pages/admin/AdminDashboard"
import AdminLogin from "../pages/admin/AdminLogin"
import AdminGuard from "../components/admin/AdminGuard";

// Layout wrapper: Navbar contains sidebar + top header + breadcrumb
function Layout() {
  return <Navbar />
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      
      {/* Admin routes (separate layout) */}
        <Route
        path="/admin"
        element={
        <AdminGuard>
        <AdminLayout />
        </AdminGuard>
      }
    >
        <Route index element={<AdminDashboard />} />
        <Route path="items" element={<div>Admin Items (next ticket)</div>} />
        <Route path="categories" element={<div>Admin Categories (next ticket)</div>} />
      </Route>

      {/* Public / customer routes (Navbar layout) */}
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/menu" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/success" element={<Success />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/item/:id" element={<MenuItemDetails />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
