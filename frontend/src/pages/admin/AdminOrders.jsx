import { Fragment, useEffect, useState, useCallback } from "react"
import Box from "@mui/material/Box"
import FormControl from "@mui/material/FormControl"
import KeyboardArrowDownRoundedIcon from "@mui/icons-material/KeyboardArrowDownRounded"
import MenuItem from "@mui/material/MenuItem"
import Select from "@mui/material/Select"
import Skeleton from "@mui/material/Skeleton"
import Table from "@mui/material/Table"
import TableBody from "@mui/material/TableBody"
import TableCell from "@mui/material/TableCell"
import TableHead from "@mui/material/TableHead"
import TableRow from "@mui/material/TableRow"
import Typography from "@mui/material/Typography"
import { getFilteredOrders, updateOrderStatus } from "../../API/ordersApi"
import { formatLL } from "../../utils/currency"
import { formatBeirutDateTime } from "../../utils/dateTime"
import {
  adminBodySx,
  adminCardSx,
  adminPageTitleSx,
  adminPalette,
  adminTableWrapSx,
} from "../../components/admin/adminUi"

const filterLabelSx = {
  fontSize: 12,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  mb: 0.75,
}

const headCellSx = {
  py: "12px",
  px: "16px",
  fontSize: 13,
  fontWeight: 500,
  color: adminPalette.textSecondary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  backgroundColor: adminPalette.surfaceSoft,
  whiteSpace: "nowrap",
}

const bodyCellSx = {
  py: "16px",
  px: "16px",
  fontSize: 13,
  lineHeight: 1.55,
  color: adminPalette.textPrimary,
  borderBottom: `0.5px solid ${adminPalette.borderRow}`,
  verticalAlign: "middle",
}

const statusColors = {
  received: { backgroundColor: "#dbeafe", color: "#1d4ed8" },
  in_progress: { backgroundColor: "#fef3c7", color: "#b45309" },
  completed: { backgroundColor: "#f0fdf4", color: "#15803d" },
  cancelled: { backgroundColor: "#fee2e2", color: "#c0392b" },
}

const orderStatusOptions = [
  { value: "received", label: "Received" },
  { value: "in_progress", label: "In progress" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

const orderTypeOptions = [
  { value: "all", label: "All types" },
  { value: "pickup", label: "Pickup" },
  { value: "dine_in", label: "Dine in" },
]

const filterSelectMenuProps = {
  PaperProps: {
    sx: {
      mt: 0.5,
      borderRadius: "10px",
      border: "0.5px solid rgba(0,0,0,0.10)",
      boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
    },
  },
}

const filterSelectFieldSx = {
  minWidth: 220,
  "& .MuiOutlinedInput-notchedOutline": {
    border: "0.5px solid rgba(0,0,0,0.15)",
  },
  "& .MuiOutlinedInput-root": {
    borderRadius: "8px",
  },
  "& .MuiSelect-select": {
    padding: "8px 34px 8px 10px",
    fontSize: 12,
    lineHeight: 1.4,
    color: adminPalette.textPrimary,
    backgroundColor: adminPalette.pageBg,
    borderRadius: "8px",
  },
  "& .MuiSvgIcon-root": {
    color: adminPalette.textTertiary,
    right: 10,
  },
  "& .Mui-focused .MuiOutlinedInput-notchedOutline": {
    borderColor: adminPalette.brandPrimary,
    boxShadow: "0 0 0 2px rgba(0,112,74,0.10)",
  },
}

function getStatusSelectSx(status) {
  return {
    minWidth: 132,
    "& .MuiOutlinedInput-notchedOutline": {
      border: "0.5px solid rgba(0,0,0,0.04)",
    },
    "& .MuiOutlinedInput-root:hover .MuiOutlinedInput-notchedOutline": {
      borderColor: "rgba(0,0,0,0.08)",
    },
    "& .MuiSelect-select": {
      py: "5px",
      pl: 1.25,
      pr: "26px !important",
      fontSize: 12,
      fontWeight: 500,
      borderRadius: "8px",
      ...statusColors[status],
    },
    "& .MuiSvgIcon-root": {
      color: statusColors[status]?.color || adminPalette.textSecondary,
      right: 8,
    },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: adminPalette.textPrimary,
      boxShadow: "0 0 0 2px rgba(0,0,0,0.06)",
    },
  }
}

function summarizeOrderItems(items = []) {
  const names = items.map((item) => item?.name).filter(Boolean)

  if (names.length === 0) {
    return {
      primary: "No items",
      secondary: "",
      title: "",
    }
  }

  if (names.length === 1) {
    return {
      primary: names[0],
      secondary: "1 item",
      title: names[0],
    }
  }

  return {
    primary: `${names[0]} +${names.length - 1}`,
    secondary: `${names.length} items`,
    title: names.join(", "),
  }
}

function formatGroupLabel(groupId) {
  if (!groupId) return ""

  return String(groupId)
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function formatSelections(selectedOptions = []) {
  return selectedOptions
    .map((selection) => {
      if (!selection) return ""
      if (typeof selection === "string") return selection

      const group = selection.groupName || formatGroupLabel(selection.groupId)
      const option = selection.optionName || selection.name || ""
      const sub = selection.suboptionName || selection.sub || ""

      if (!option) return ""
      const value = sub ? `${option} (${sub})` : option
      return group ? `${group}: ${value}` : value
    })
    .filter(Boolean)
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

const skeletonCardSx = {
  ...adminTableWrapSx,
  border: "1px solid #e0e0e0",
  boxShadow: "0 0 6px rgba(0,0,0,0.06)",
  borderRadius: "12px",
  overflow: "hidden",
}

function OrdersTableSkeleton() {
  const rows = Array.from({ length: 6 })

  return (
    <Box sx={skeletonCardSx} aria-hidden="true">
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: "100px 140px minmax(220px, 1.3fr) 120px 110px 150px 170px",
          backgroundColor: adminPalette.surfaceSoft,
          borderBottom: "0.5px solid rgba(0,0,0,0.07)",
          minWidth: 980,
        }}
      >
        {["Order #", "Customer", "Items", "Total", "Type", "Status", "Date"].map((key) => (
          <Box key={key} sx={{ px: "14px", py: "11px" }}>
            <Skeleton
              animation="wave"
              variant="text"
              width={key === "Items" ? "60%" : "48%"}
              height={18}
              sx={{ bgcolor: "#eceff1" }}
            />
          </Box>
        ))}
      </Box>

      <Box sx={{ minWidth: 980 }}>
        {rows.map((_, index) => (
          <Box
            key={`order-skeleton-row-${index}`}
            sx={{
              display: "grid",
              gridTemplateColumns: "100px 140px minmax(220px, 1.3fr) 120px 110px 150px 170px",
              borderBottom: index === rows.length - 1 ? "none" : "0.5px solid rgba(0,0,0,0.07)",
              backgroundColor: adminPalette.surface,
            }}
          >
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="72%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="82%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="92%" height={22} sx={{ bgcolor: "#eceff1" }} />
              <Skeleton animation="wave" variant="text" width="68%" height={20} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="78%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="70%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
            <Box sx={{ px: "14px", py: "14px", display: "flex", alignItems: "center" }}>
              <Skeleton
                animation="wave"
                variant="rounded"
                width={112}
                height={32}
                sx={{ borderRadius: "8px", bgcolor: "#eceff1" }}
              />
            </Box>
            <Box sx={{ px: "14px", py: "14px" }}>
              <Skeleton animation="wave" variant="text" width="88%" height={22} sx={{ bgcolor: "#eceff1" }} />
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  )
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([])
  const [error, setError] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [typeFilter, setTypeFilter] = useState("all")
  const [loading, setLoading] = useState(false)
  const [expandedOrderId, setExpandedOrderId] = useState(null)

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

  const toggleExpandedOrder = (orderId) => {
    setExpandedOrderId((current) => (current === orderId ? null : orderId))
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
            <FormControl size="small" sx={filterSelectFieldSx}>
              <Select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                MenuProps={filterSelectMenuProps}
              >
                <MenuItem value="all" sx={{ fontSize: 12 }}>
                  All statuses
                </MenuItem>
                {orderStatusOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value} sx={{ fontSize: 12 }}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>

          <Box>
            <Typography sx={filterLabelSx}>Order type</Typography>
            <FormControl size="small" sx={filterSelectFieldSx}>
              <Select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                MenuProps={filterSelectMenuProps}
              >
                {orderTypeOptions.map((option) => (
                  <MenuItem key={option.value} value={option.value} sx={{ fontSize: 12 }}>
                    {option.label}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
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

      </Box>

      {loading ? (
        <OrdersTableSkeleton />
      ) : !error && orders.length === 0 ? (
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
              {orders.map((order, index) => {
                const itemSummary = summarizeOrderItems(order.items)
                const isExpanded = expandedOrderId === order._id

                return (
                  <Fragment key={order._id}>
                    <TableRow
                      sx={{
                        backgroundColor: index % 2 === 0 ? adminPalette.surface : "#fcfcfb",
                        cursor: "pointer",
                        transition: "background-color 0.2s ease",
                        "&:hover": {
                          backgroundColor: "#f7f8f6",
                        },
                      }}
                      onClick={() => toggleExpandedOrder(order._id)}
                    >
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap", width: 108 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                          {order.orderNumber}
                        </Typography>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, width: 180 }}>
                        <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                          {order.customer?.name || "-"}
                        </Typography>
                        {order.customer?.phone && (
                          <Typography sx={{ fontSize: 11, color: adminPalette.textTertiary }}>
                            {order.customer.phone}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, width: "30%" }}>
                        <Box title={itemSummary.title} sx={{ display: "flex", flexDirection: "column", gap: 0.35 }}>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, flexWrap: "wrap" }}>
                            <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                              {order.items?.[0]?.name || itemSummary.primary}
                            </Typography>
                            {(order.items?.length || 0) > 1 && (
                              <Typography
                                sx={{
                                  fontSize: 12,
                                  fontWeight: 600,
                                  color: adminPalette.brandPrimary,
                                }}
                              >
                                +{order.items.length - 1}
                              </Typography>
                            )}
                          </Box>
                          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flexWrap: "wrap" }}>
                            <Typography sx={{ fontSize: 11, color: adminPalette.textTertiary }}>
                              {itemSummary.secondary}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap", width: 138 }}>
                        {order.total != null ? formatLL(order.total) : "-"}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap", width: 116 }}>
                        {formatOrderType(order.orderType)}
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, width: 148 }} onClick={(e) => e.stopPropagation()}>
                        <FormControl size="small" sx={getStatusSelectSx(order.status)}>
                          <Select
                            value={order.status}
                            onChange={(e) => handleStatusChange(order._id, e.target.value)}
                            MenuProps={{
                              PaperProps: {
                                sx: {
                                  mt: 0.5,
                                  borderRadius: "10px",
                                  border: "0.5px solid rgba(0,0,0,0.10)",
                                  boxShadow: "0 10px 24px rgba(15,23,42,0.08)",
                                },
                              },
                            }}
                          >
                            {orderStatusOptions.map((option) => (
                              <MenuItem key={option.value} value={option.value} sx={{ fontSize: 12 }}>
                                {option.label}
                              </MenuItem>
                            ))}
                          </Select>
                        </FormControl>
                      </TableCell>
                      <TableCell sx={{ ...bodyCellSx, whiteSpace: "nowrap", width: 178 }}>
                        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1 }}>
                          <Typography sx={{ fontSize: 13, color: adminPalette.textPrimary, whiteSpace: "nowrap" }}>
                            {formatBeirutDateTime(order.createdAt)}
                          </Typography>
                          <KeyboardArrowDownRoundedIcon
                            sx={{
                              fontSize: 18,
                              color: adminPalette.textTertiary,
                              transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                              transition: "transform 0.2s ease",
                              flexShrink: 0,
                            }}
                          />
                        </Box>
                      </TableCell>
                    </TableRow>

                    {isExpanded && (
                      <TableRow
                        sx={{
                          backgroundColor: index % 2 === 0 ? "#f1f2ef" : "#eeefeb",
                          "&:last-of-type td": {
                            borderBottom: "none",
                          },
                        }}
                      >
                        <TableCell colSpan={7} sx={{ px: "16px", py: 0, borderBottom: `0.5px solid ${adminPalette.borderRow}` }}>
                          <Box
                            sx={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 1.5,
                              py: 2,
                            }}
                          >
                            <Box sx={{ display: "grid", gap: 1.25 }}>
                              {(order.items || []).map((item, itemIndex) => {
                                const selectionLines = formatSelections(item.selectedOptions)

                                return (
                                  <Box
                                    key={`${order._id}-item-${itemIndex}`}
                                    sx={{
                                      display: "grid",
                                      gap: 0.5,
                                      gridTemplateColumns: { xs: "1fr", md: "minmax(0, 1fr) 120px" },
                                      alignItems: "start",
                                      borderBottom:
                                        itemIndex === (order.items || []).length - 1
                                          ? "none"
                                          : "0.5px solid rgba(0,0,0,0.07)",
                                      px: 0,
                                      py: 0.75,
                                    }}
                                  >
                                    <Box sx={{ minWidth: 0 }}>
                                      <Typography sx={{ fontSize: 13, fontWeight: 500, color: adminPalette.textPrimary }}>
                                        {item.qty} x {item.name}
                                      </Typography>
                                      {selectionLines.length > 0 && (
                                        <Box sx={{ mt: 0.45, display: "flex", flexDirection: "column", gap: 0.45 }}>
                                          <Typography
                                            sx={{
                                              fontSize: 10.5,
                                              fontWeight: 600,
                                              color: adminPalette.textSecondary,
                                              textTransform: "uppercase",
                                              letterSpacing: "0.05em",
                                            }}
                                          >
                                            Customer selected
                                          </Typography>
                                          <Typography
                                            sx={{ fontSize: 11, color: adminPalette.textTertiary, lineHeight: 1.5 }}
                                          >
                                            {selectionLines.join(" · ")}
                                          </Typography>
                                        </Box>
                                      )}
                                      {item.instructions && (
                                        <Box sx={{ mt: 0.55, display: "flex", flexDirection: "column", gap: 0.25 }}>
                                          <Typography
                                            sx={{
                                              fontSize: 10.5,
                                              fontWeight: 600,
                                              color: adminPalette.textSecondary,
                                              textTransform: "uppercase",
                                              letterSpacing: "0.05em",
                                            }}
                                          >
                                            Special instructions
                                          </Typography>
                                          <Typography sx={{ fontSize: 12, color: adminPalette.textSecondary, lineHeight: 1.55 }}>
                                            {item.instructions}
                                          </Typography>
                                        </Box>
                                      )}
                                    </Box>
                                    <Box sx={{ display: "flex", justifyContent: { xs: "flex-start", md: "flex-end" } }}>
                                      <Typography sx={{ fontSize: 12, fontWeight: 600, color: adminPalette.textPrimary, whiteSpace: "nowrap" }}>
                                        {item.lineTotal != null ? formatLL(item.lineTotal) : formatLL((item.unitPrice || 0) * (item.qty || 0))}
                                      </Typography>
                                    </Box>
                                  </Box>
                                )
                              })}
                            </Box>

                            {order.notesToBarista && (
                              <Typography
                                sx={{
                                  fontSize: 12,
                                  color: adminPalette.textSecondary,
                                  fontStyle: "italic",
                                  lineHeight: 1.6,
                                  pt: 0.25,
                                }}
                              >
                                Barista note: {order.notesToBarista}
                              </Typography>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
