import { Link } from "react-router-dom"
import Box from "@mui/material/Box"
import Typography from "@mui/material/Typography"
import ArrowOutwardRoundedIcon from "@mui/icons-material/ArrowOutwardRounded"
import {
  adminBodySx,
  adminCardSx,
  adminPageTitleSx,
  adminPalette,
} from "../../components/admin/adminUi"

function ItemsCardIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      width="16"
      height="16"
      {...props}
    >
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="15" y2="18" />
    </svg>
  )
}

function CategoriesCardIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      {...props}
    >
      <circle cx="12" cy="5" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="18" r="2" />
      <path d="M12 7v5" />
      <path d="M12 12l-6 4" />
      <path d="M12 12l6 4" />
    </svg>
  )
}

function OrdersCardIcon(props) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      width="16"
      height="16"
      {...props}
    >
      <rect x="3" y="4" width="18" height="13" rx="2" />
      <path d="M8 20h8" />
      <path d="M12 17v3" />
    </svg>
  )
}

const cards = [
  {
    to: "/admin/items",
    title: "Menu",
    description: "Create, edit, and organize the products shown to customers.",
    icon: ItemsCardIcon,
  },
  {
    to: "/admin/categories",
    title: "Categories",
    description: "Update category structure, images, and variant group assignments.",
    icon: CategoriesCardIcon,
  },
  {
    to: "/admin/orders",
    title: "Orders",
    description: "Review recent orders and update each order's fulfillment status.",
    icon: OrdersCardIcon,
  },
]

export default function AdminDashboard() {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Typography sx={adminPageTitleSx}>Admin dashboard</Typography>
        <Typography sx={{ ...adminBodySx, color: adminPalette.textSecondary, maxWidth: 720 }}>
          Manage menu items, categories, and orders in one place.
        </Typography>
      </Box>

      <Box
        sx={{
          display: "grid",
          gap: 2,
          gridTemplateColumns: {
            xs: "1fr",
            md: "repeat(3, minmax(0, 1fr))",
          },
        }}
      >
        {cards.map((card) => {
          const CardIcon = card.icon

          return (
            <Box
              key={card.to}
              component={Link}
              to={card.to}
              sx={{
                ...adminCardSx,
                minHeight: 196,
                display: "flex",
                flexDirection: "column",
                gap: 2.25,
                textDecoration: "none",
                p: { xs: 2.5, md: 3 },
                transition: "all 0.3s cubic-bezier(0.23, 1, 0.32, 1)",
                "&:hover": {
                  borderColor: "rgba(26, 74, 53, 0.35)",
                  boxShadow:
                    "0 18px 30px rgba(26, 74, 53, 0.10), inset 0 0 0 1px rgba(26, 74, 53, 0.08)",
                  transform: "translateY(-4px)",
                  "& .dashboard-arrow": {
                    color: adminPalette.brandPrimary,
                    transform: "translate(3px, -3px)",
                  },
                },
              }}
            >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "999px",
                  backgroundColor: adminPalette.brandPrimary,
                  color: "#ffffff",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <CardIcon sx={{ fontSize: 18 }} />
              </Box>

              <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75, flex: 1 }}>
                <Typography sx={{ fontSize: 14, fontWeight: 500, color: adminPalette.textPrimary }}>
                  {card.title}
                </Typography>
                <Typography sx={{ fontSize: 12, color: adminPalette.textSecondary, lineHeight: 1.6 }}>
                  {card.description}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: "auto" }}>
                <ArrowOutwardRoundedIcon
                  className="dashboard-arrow"
                  sx={{
                    fontSize: 18,
                    color: "#c0c0c0",
                    transition: "transform 0.2s ease, color 0.2s ease",
                  }}
                />
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
