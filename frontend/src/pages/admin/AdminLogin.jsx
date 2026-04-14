import { useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Box,
  IconButton,
  Paper,
  TextField,
  Button,
  Typography,
  InputAdornment,
} from "@mui/material"
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined"
import LockOutlinedIcon from "@mui/icons-material/LockOutlined"
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined"
import VisibilityOffOutlinedIcon from "@mui/icons-material/VisibilityOffOutlined"
import { adminLogin } from "../../API/adminApi"
import { useSession } from "../../hooks/useSession"
import {
  adminBodySx,
  adminBorder,
  adminPalette,
  adminPrimaryButtonSx,
  adminTextFieldSx,
} from "../../components/admin/adminUi"

export default function AdminLogin() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
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
          maxWidth: 440,
          p: { xs: 3, sm: 3.5 },
          borderRadius: "14px",
          border: adminBorder,
          boxShadow: "none",
          backgroundColor: adminPalette.surface,
        }}
      >
        <Box sx={{ display: "flex", flexDirection: "column", gap: 0.9, mb: 3.25 }}>
          <Box
            component="img"
            src="/stories-logo.png"
            alt="Stories"
            sx={{
              maxWidth: "118px",
              maxHeight: "28px",
              objectFit: "contain",
              display: "block",
            }}
            onError={(e) => {
              e.currentTarget.style.display = "none"
            }}
          />
          <Typography
            sx={{
              ...adminBodySx,
              color: adminPalette.textPrimary,
              fontWeight: 600,
              fontSize: 14,
            }}
          >
            Admin login
          </Typography>
          <Typography sx={{ ...adminBodySx, fontSize: 13.5 }}>
            Sign in to manage items, categories, variant groups, and orders.
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} sx={{ display: "flex", flexDirection: "column", gap: 2.1 }}>
          <TextField
            label="Admin email"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            sx={{
              ...adminTextFieldSx,
              "& .MuiInputLabel-root": {
                fontSize: 13,
                fontWeight: 600,
                color: adminPalette.textSecondary,
                transform: "translate(14px, 13px) scale(1)",
              },
              "& .MuiInputLabel-root.MuiInputLabel-shrink": {
                transform: "translate(14px, -8px) scale(0.92)",
                backgroundColor: adminPalette.surface,
                padding: "0 4px",
              },
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                backgroundColor: adminPalette.surface,
                "& fieldset": {
                  border: "1px solid #e0e0e0",
                },
                "&:hover fieldset": {
                  borderColor: "#e0e0e0",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#1e5631",
                  boxShadow: "none",
                },
              },
              "& .MuiInputBase-input": {
                padding: "12px",
                fontSize: 14,
              },
            }}
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
            type={showPassword ? "text" : "password"}
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            sx={{
              ...adminTextFieldSx,
              "& .MuiInputLabel-root": {
                fontSize: 13,
                fontWeight: 600,
                color: adminPalette.textSecondary,
                transform: "translate(14px, 13px) scale(1)",
              },
              "& .MuiInputLabel-root.MuiInputLabel-shrink": {
                transform: "translate(14px, -8px) scale(0.92)",
                backgroundColor: adminPalette.surface,
                padding: "0 4px",
              },
              "& .MuiOutlinedInput-root": {
                borderRadius: "8px",
                backgroundColor: adminPalette.surface,
                "& fieldset": {
                  border: "1px solid #e0e0e0",
                },
                "&:hover fieldset": {
                  borderColor: "#e0e0e0",
                },
                "&.Mui-focused fieldset": {
                  borderColor: "#1e5631",
                  boxShadow: "none",
                },
              },
              "& .MuiInputBase-input": {
                padding: "12px",
                fontSize: 14,
              },
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: adminPalette.textTertiary }} />
                </InputAdornment>
              ),
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    onClick={() => setShowPassword((v) => !v)}
                    edge="end"
                    size="small"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    sx={{ color: adminPalette.textTertiary, mr: -0.5 }}
                  >
                    {showPassword ? (
                      <VisibilityOffOutlinedIcon sx={{ fontSize: 18 }} />
                    ) : (
                      <VisibilityOutlinedIcon sx={{ fontSize: 18 }} />
                    )}
                  </IconButton>
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

          <Button
            type="submit"
            variant="contained"
            fullWidth
            sx={{
              ...adminPrimaryButtonSx,
              mt: 1,
              border: "none",
              backgroundColor: "#1e5631",
              color: "#fff",
              fontWeight: 600,
              borderRadius: "8px",
              py: "1rem",
              px: "2rem",
              cursor: "pointer",
              width: "100%",
              fontSize: "1rem",
              letterSpacing: "0.5px",
              transition: "all 0.3s ease",
              "&:hover": {
                backgroundColor: "#1e5631",
                transform: "translateY(-2px)",
                boxShadow: "none",
              },
            }}
          >
            Login
          </Button>
        </Box>
      </Paper>
    </Box>
  )
}
