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
    } catch (err) {
      setError("Invalid email or password");
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background:
          "linear-gradient(135deg, #f8fff8 0%, #ffffff 50%, #eef8ef 100%)",
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
          maxWidth: 420,
          p: 4,
          borderRadius: 4,
          boxShadow: "0 10px 30px rgba(46,125,50,0.12)",
          border: "1px solid #e6f2e6"
        }}
      >
        <Box sx={{ textAlign: "center", mb: 3 }}>
          <Typography
            variant="h3"
            sx={{
              fontWeight: 800,
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
            sx={{ color: "#5f6f65" }}
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
              mt: 1,
              py: 1.4,
              borderRadius: "14px",
              fontWeight: 700,
              textTransform: "none",
              background: "linear-gradient(90deg, #2e7d32 0%, #43a047 100%)",
              "&:hover": {
                background: "linear-gradient(90deg, #256a2a 0%, #388e3c 100%)"
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