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
import AdminItems from "../pages/admin/AdminItems"
import AdminOrders from "../pages/admin/AdminOrders"
import AdminVariantGroups from "../pages/admin/AdminVariantGroups"
import AdminLogin from "../pages/admin/AdminLogin"
import AdminGuard from "../components/admin/AdminGuard";
import AuthGuard from "../components/auth/AuthGuard";

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
        <Route path="items" element={<AdminItems />} />
        <Route path="variant-groups" element={<AdminVariantGroups />} />
        <Route path="categories" element={<div>Admin Categories (later)</div>} />
        <Route path="orders" element={<AdminOrders />} />
      </Route>

      {/* Public / customer routes (Navbar layout) */}
      <Route element={<Navbar />}>
        <Route path="/" element={<Home />} />
        <Route path="/menu/:category?" element={<Menu />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/success" element={<Success />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/dashboard" element={<AuthGuard><Dashboard /></AuthGuard>} />
        <Route path="/item/:id" element={<MenuItemDetails />} />
      </Route>

      {/* Catch-all: top-level so it never competes with /admin */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
