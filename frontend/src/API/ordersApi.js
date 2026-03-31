import http from "./http";

export const getOrders = async () => {
  const response = await http.get("/orders");
  return response.data;
};

export const getMyOrders = () =>
  http.get("/orders/my").then(r => r.data);

export const updateOrderStatus = (orderId, status) =>
  http.patch(`/orders/${orderId}/status`, { status }).then(r => r.data);

export const getFilteredOrders = ({ status, orderType } = {}) =>
  http.get("/orders", {
    params: {
      status: status || undefined,
      orderType: orderType || undefined
    }
  }).then(r => r.data);
export const submitOrder = (payload) => http.post('/orders', payload);
