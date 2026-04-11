import { useEffect, useState, useCallback } from "react"
import Box from "@mui/material/Box"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Typography from "@mui/material/Typography"
import { getFilteredOrders, updateOrderStatus } from "../../API/ordersApi"
import {
  adminBodySx,
  adminCardSx,
  adminPageTitleSx,
  adminPalette,
  adminSelectSx,
  adminTableWrapSx,
} from "../../components/admin/adminUi"

const filterLabelSx = {
  fontSize: 12,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  mb: 0.75,
}

const headCellSx = {
  py: "11px",
  px: "14px",
  fontSize: 13,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  backgroundColor: adminPalette.surfaceSoft,
  whiteSpace: "nowrap",
}

const bodyCellSx = {
  py: "11px",
  px: "14px",
  fontSize: 13,
  color: adminPalette.textPrimary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  verticalAlign: "top",
}

const statusColors = {
  received: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  in_progress: { backgroundColor: "#fef3c7", color: "#b45309" },
  completed: { backgroundColor: "#f0fdf4", color: "#15803d" },
  cancelled: { backgroundColor: "#fee2e2", color: "#c0392b" },
}

function getStatusSelectSx(status) {
  return {
    ...adminSelectSx,
    minWidth: 132,
    py: "6px",
    px: 1.25,
    fontSize: 12,
    fontWeight: 500,
    borderRadius: "8px",
    borderColor: "transparent",
    boxShadow: "none",
    ...statusColors[status],
    "&:focus": {
      borderColor: adminPalette.textPrimary,
      boxShadow: "0 0 0 2px rgba(0,0,0,0.06)",
    },
  }
}

function formatOrderType(orderType) {
  if (!orderType) {
    return "-"
  }

  return orderType
    .split("_")
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ")
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [loading, setLoading] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getFilteredOrders({
        status: statusFilter !== "all" ? statusFilter : undefined,
        orderType: typeFilter !== "all" ? typeFilter : undefined,
      })
      const fetchedOrders = Array.isArray(data.orders) ? data.orders : []
      setOrders(fetchedOrders)
      setError("")
    } catch (err) {
      console.error(err)
      setError("Failed to fetch orders.")
    } finally {
      setLoading(false)
    }
  }, [statusFilter, typeFilter])

  useEffect(() => {
    fetchOrders()
  }, [fetchOrders])

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus)
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o)),
      )
    } catch (err) {
      console.error("Failed to update status:", err)
      setError("Failed to update order status.")
    }
  }

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.75 }}>
        <Typography sx={adminPageTitleSx}>Orders</Typography>
        <Typography sx={adminBodySx}>
          Filter by status or service type, then update each order directly from the table.
        </Typography>
      </Box>

      <Box sx={{ ...adminCardSx, display: "flex", flexDirection: "column", gap: 2 }}>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 220px))" },
          }}
        >
          <Box>
            <Typography sx={filterLabelSx}>Status</Typography>
            <Box
              component="select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              sx={adminSelectSx}
            >
              <option value="all">All statuses</option>
              <option value="received">Received</option>
              <option value="in_progress">In progress</option>
              <option value="completed">Completed</option>
              <option value="cancelled">Cancelled</option>
            </Box>
          </Box>

          <Box>
            <Typography sx={filterLabelSx}>Order type</Typography>
            <Box
              component="select"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              sx={adminSelectSx}
            >
              <option value="all">All types</option>
              <option value="pickup">Pickup</option>
              <option value="dine_in">Dine in</option>
            </Box>
          </Box>
        </Box>

        {error && (
          <Box
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

        {loading && (
          <Typography sx={adminBodySx}>Loading orders...</Typography>
        )}
      </Box>

      {!error && !loading && orders.length === 0 ? (
        <Box sx={adminCardSx}>
          <Typography sx={adminBodySx}>No orders found.</Typography>
        </Box>
      ) : (
        <Box sx={adminTableWrapSx}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell sx={headCellSx}>Order #</TableCell>
                <TableCell sx={headCellSx}>Customer</TableCell>
                <TableCell sx={headCellSx}>Items</TableCell>
                <TableCell sx={headCellSx}>Total</TableCell>
                <TableCell sx={headCellSx}>Type</TableCell>
                <TableCell sx={headCellSx}>Status</TableCell>
                <TableCell sx={headCellSx}>Date</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {orders.map((order) => (
                <TableRow
                  key={order._id}
                  sx={{
                    "&:hover": {
                      backgroundColor: "#fafaf9",
                    },
                    "&:last-of-type td": {
                      borderBottom: "none",
                    },
                  }}
                >
                  <TableCell sx={bodyCellSx}>{order.orderNumber}</TableCell>
                  <TableCell sx={bodyCellSx}>{order.customer?.name || "-"}</TableCell>
                  <TableCell sx={{ ...bodyCellSx, minWidth: 220 }}>
                    {order.items?.map((item) => item.name).join(", ") || "No items"}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>
                    {order.total ?? "-"}
                  </TableCell>
                  <TableCell sx={bodyCellSx}>{formatOrderType(order.orderType)}</TableCell>
                  <TableCell sx={bodyCellSx}>
                    <Box
                      component="select"
                      value={order.status}
                      onChange={(e) => handleStatusChange(order._id, e.target.value)}
                      sx={getStatusSelectSx(order.status)}
                    >
                      <option value="received">Received</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </Box>
                  </TableCell>
                  <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap" }}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
