import { useEffect, useState, useCallback } from "react";
import { getFilteredOrders, updateOrderStatus } from "../../API/ordersApi";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [loading, setLoading] = useState(false);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getFilteredOrders({
        status: statusFilter !== "all" ? statusFilter : undefined,
        orderType: typeFilter !== "all" ? typeFilter : undefined,
      });
      const fetchedOrders = Array.isArray(data.orders) ? data.orders : [];
      setOrders(fetchedOrders);
      setError("");
    } catch (err) {
      console.error(err);
      setError("Failed to fetch orders.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const handleStatusChange = async (orderId, newStatus) => {
    try {
      await updateOrderStatus(orderId, newStatus);
      setOrders((prev) =>
        prev.map((o) => (o._id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (err) {
      console.error("Failed to update status:", err);
      setError("Failed to update order status.");
    }
  };

  const statusColors = {
    received: "#2196f3",
    in_progress: "#ff9800",
    completed: "#4caf50",
    cancelled: "#f44336",
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2 style={{ color: "#2e7d32", marginBottom: "16px", fontSize: "2rem", fontWeight: 800 }}>
        Order History
      </h2>

      <div style={{ marginBottom: "16px", display: "flex", gap: "12px" }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="all">All Statuses</option>
          <option value="received">Received</option>
          <option value="in_progress">In Progress</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>

        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
          <option value="all">All Types</option>
          <option value="pickup">Pickup</option>
          <option value="dine_in">Dine In</option>
        </select>
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}
      {loading && <p>Loading orders...</p>}

      {!error && !loading && orders.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <div style={{
          overflowX: "auto",
          background: "#fff",
          borderRadius: "16px",
          boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
          border: "1px solid #dfe9e1",
        }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3faf4" }}>
                <th style={cellStyle}>Order #</th>
                <th style={cellStyle}>Customer</th>
                <th style={cellStyle}>Items</th>
                <th style={cellStyle}>Total</th>
                <th style={cellStyle}>Type</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id}>
                  <td style={cellStyle}>{order.orderNumber}</td>
                  <td style={cellStyle}>{order.customer?.name || "-"}</td>
                  <td style={cellStyle}>
                    {order.items?.map((item) => item.name).join(", ") || "No items"}
                  </td>
                  <td style={cellStyle}>{order.total ?? "-"}</td>
                  <td style={cellStyle}>{order.orderType ?? "-"}</td>
                  <td style={cellStyle}>
                    <select
                      value={order.status}
                      style={{
                        padding: "4px 8px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        backgroundColor: statusColors[order.status] ?? "#eee",
                        color: "#fff",
                      }}
                      onChange={(e) => handleStatusChange(order._id, e.target.value)}
                    >
                      <option value="received">Received</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </td>
                  <td style={cellStyle}>
                    {order.createdAt ? new Date(order.createdAt).toLocaleString() : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

const cellStyle = {
  borderBottom: "1px solid #e5e7eb",
  padding: "12px 14px",
  textAlign: "left",
};