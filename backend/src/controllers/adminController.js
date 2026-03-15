export const adminLogin = async (req, res) => {
  const { email, password } = req.body;

  // Temporary hardcoded admin (later you will use DB)
  const ADMIN_EMAIL = "admin@storiescafe.com";
  const ADMIN_PASSWORD = "admin123";

  if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
    return res.status(401).json({
      message: "Invalid admin credentials",
    });
  }

  return res.json({
    token: "admin-demo-token",
  });
};