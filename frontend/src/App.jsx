import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/index.jsx'
import { AuthProvider } from './context/AuthContext.jsx'
import './styles/index.css'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
