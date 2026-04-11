import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  InputAdornment,
} from "@mui/material"
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined"
import LockOutlinedIcon from "@mui/icons-material/LockOutlined"
import { adminLogin } from "../../API/adminApi"
import { useSession } from "../../hooks/useSession"
import {
  adminBodySx,
  adminBorder,
  adminPageTitleSx,
  adminPalette,
  adminPrimaryButtonSx,
  adminTextFieldSx,
} from "../../components/admin/adminUi"

export default function AdminLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const navigate = useNavigate()
  const { refreshSession } = useSession()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    try {
      await adminLogin({ email, password })
      await refreshSession()
      navigate("/admin")
    } catch (err) {
      const message = err.response?.data?.error?.message || "Invalid email or password"
      setError(message)
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        backgroundColor: adminPalette.pageBg,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2,
      }}
    >
      <Paper
        elevation={0}
        sx={{
          width: "100%",
          maxWidth: 400,
          p: { xs: 2.5, sm: 3 },
          borderRadius: "14px",
          border: adminBorder,
          boxShadow: "none",
          backgroundColor: adminPalette.surface,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, mb: 3 }}>
          <Typography sx={adminPageTitleSx}>Stories Café</Typography>
          <Typography sx={{ ...adminBodySx, color: adminPalette.textPrimary, fontWeight: 500 }}>
            Admin login
          </Typography>
          <Typography sx={adminBodySx}>
            Sign in to manage items, categories, variant groups, and orders.
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
          <TextField
            label="Admin email"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={adminTextFieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailOutlinedIcon sx={{ color: adminPalette.textTertiary }} />
                </InputAdornment>
              ),
            }}
          />

          <TextField
            label="Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={adminTextFieldSx}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: adminPalette.textTertiary }} />
                </InputAdornment>
              ),
            }}
          />

          {error && (
            <Box
              role="status"
              sx={{
                borderRadius: "8px",
                border: "0.5px solid #f5b7b1",
                backgroundColor: "#fff8f7",
                px: 1.25,
                py: 1,
              }}
            >
              <Typography sx={{ fontSize: 12, fontWeight: 500, color: adminPalette.danger }}>
                {error}
              </Typography>
            </Box>
          )}

          <Button type="submit" variant="contained" fullWidth sx={{ ...adminPrimaryButtonSx, mt: 0.5, py: 1.1 }}>
            Login
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
