import { BrowserRouter } from 'react-router-dom'
import AppRoutes from './routes/index.jsx'
import './styles/index.css'

export default function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  )
}
