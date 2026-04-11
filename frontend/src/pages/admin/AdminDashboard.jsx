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
      stroke="#333"
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
      stroke="#333"
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
      stroke="#333"
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
    title: "Menu items",
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
        <Typography sx={{ ...adminBodySx, maxWidth: 720 }}>
          A clean control surface for the Stories Café back office. Use the cards below to jump
          into the areas you manage most often.
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
              gap: 2.5,
              textDecoration: "none",
              p: { xs: 2.5, md: 3 },
              transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease",
              "&:hover": {
                borderColor: "rgba(0,0,0,0.20)",
                boxShadow: "0 6px 16px rgba(17,17,17,0.05)",
                transform: "translateY(-1px)",
              },
            }}
          >
              <Box
                sx={{
                  width: 36,
                  height: 36,
                  borderRadius: "999px",
                  backgroundColor: adminPalette.surfaceSoft,
                  color: adminPalette.textPrimary,
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
                <Typography sx={{ fontSize: 12, color: adminPalette.textTertiary, lineHeight: 1.6 }}>
                  {card.description}
                </Typography>
              </Box>

              <Box sx={{ display: "flex", justifyContent: "flex-end", mt: "auto" }}>
                <ArrowOutwardRoundedIcon sx={{ fontSize: 18, color: "#c0c0c0" }} />
              </Box>
            </Box>
          )
        })}
      </Box>
    </Box>
  )
}
