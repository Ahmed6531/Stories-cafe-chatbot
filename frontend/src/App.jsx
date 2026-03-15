import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/index.jsx'
// TODO: CartProvider is present but static (no state changes), revert by ensuring cartReducer has logic
import { CartProvider } from './state/CartProvider.jsx'
import { AppThemeProvider } from './state/ThemeContext.jsx'
import './styles/index.css'

export default function App() {
  return (
  <AppThemeProvider>
    <BrowserRouter>
      <CartProvider>
        <AppRoutes />
      </CartProvider>
    </BrowserRouter>
  </AppThemeProvider>
)
}
