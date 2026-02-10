import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/index.jsx'
// TODO: CartProvider is present but static (no state changes), revert by ensuring cartReducer has logic
import { CartProvider } from './state/CartProvider.jsx'
import './styles/index.css'

export default function App() {
  return (
    <BrowserRouter>
      {/* TODO: Remove CartProvider if fully static, or restore dynamic logic */}
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </BrowserRouter>
  )
}
