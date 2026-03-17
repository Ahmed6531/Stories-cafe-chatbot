import { useEffect, useState } from "react";
import { getOrders } from "../../API/ordersApi";

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchOrders() {
      try {
        const data = await getOrders();
        console.log("Orders API response:", data);

        if (Array.isArray(data)) {
          setOrders(data);
        } else if (Array.isArray(data.orders)) {
          setOrders(data.orders);
        } else if (Array.isArray(data.data)) {
          setOrders(data.data);
        } else {
          setOrders([]);
          setError("Orders response format is invalid.");
        }
      } catch (err) {
        console.error("Failed to fetch orders:", err);
        setError("Failed to fetch orders.");
      }
    }

    fetchOrders();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h2
        style={{
          color: "#2e7d32",
          marginBottom: "16px",
          fontSize: "2rem",
          fontWeight: 800,
        }}
      >
        Order History
      </h2>

      {error && <p style={{ color: "red" }}>{error}</p>}

      {!error && orders.length === 0 ? (
        <p>No orders found.</p>
      ) : (
        <div
          style={{
            overflowX: "auto",
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 6px 18px rgba(0,0,0,0.05)",
            border: "1px solid #dfe9e1",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ backgroundColor: "#f3faf4" }}>
                <th style={cellStyle}>Order ID</th>
                <th style={cellStyle}>Items</th>
                <th style={cellStyle}>Total</th>
                <th style={cellStyle}>Status</th>
                <th style={cellStyle}>Date</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order._id}>
                  <td style={cellStyle}>{order._id}</td>
                  <td style={cellStyle}>
                    {order.items?.map((item) => item.name).join(", ") || "No items"}
                  </td>
                  <td style={cellStyle}>{order.total ?? "-"}</td>
                  <td style={cellStyle}>{order.status ?? "Pending"}</td>
                  <td style={cellStyle}>
                    {order.createdAt
                      ? new Date(order.createdAt).toLocaleString()
                      : "-"}
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