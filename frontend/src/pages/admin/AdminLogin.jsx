import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  InputAdornment
} from "@mui/material";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import { adminLogin } from "../../API/adminApi";

export default function AdminLogin() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const token = localStorage.getItem("adminToken");

    if (token) {
      navigate("/admin");
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const data = await adminLogin({ email, password });

      localStorage.setItem("adminToken", data.token);
      navigate("/admin");
    } catch {
      setError("Invalid email or password");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        px: 2
      }}
    >
      <Paper
        elevation={6}
        sx={{
          width: "100%",
          maxWidth: 400,
          p: "20px",
          borderRadius: "12px",
          boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
          border: "1px solid #e0e0e0"
        }}
      >
        <Box sx={{ textAlign: "center", mb: "50px" }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 700,
              color: "#1b5e20",
              mb: 1
            }}
          >
            Stories Café
          </Typography>

          <Typography
            variant="h5"
            sx={{
              fontWeight: 700,
              color: "#2e7d32"
            }}
          >
            Admin Login
          </Typography>

          <Typography
            variant="body2"
            sx={{ color: "#5f6f65", mt: "10px" }}
          >
            Sign in to access the admin dashboard
          </Typography>
        </Box>

        <Box component="form" onSubmit={handleSubmit} display="flex" flexDirection="column" gap={2}>
          <TextField
            label="Admin Email"
            type="email"
            fullWidth
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <EmailOutlinedIcon sx={{ color: "#2e7d32" }} />
                </InputAdornment>
              )
            }}
          />

          <TextField
            label="Password"
            type="password"
            fullWidth
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <LockOutlinedIcon sx={{ color: "#2e7d32" }} />
                </InputAdornment>
              )
            }}
          />

          {error && (
            <Typography color="error" textAlign="center">
              {error}
            </Typography>
          )}

          <Button
            type="submit"
            variant="contained"
            size="large"
            sx={{
              mt: "12px",
              padding: "1rem 2rem",
              borderRadius: "8px",
              fontWeight: 600,
              textTransform: "none",
              letterSpacing: "0.5px",
              backgroundColor: (theme) => theme.brand.primaryDark,
              transition: "all 0.3s ease",
              "&:hover": {
                backgroundColor: (theme) => theme.brand.primaryDark,
                transform: "translateY(-2px)",
              }
            }}
          >
            Login
          </Button>
        </Box>
      </Paper>
    </Box>
  );
}