import http from "./http";

export const getOrders = async () => {
  const response = await http.get("/orders");
  return response.data;
};

export const submitOrder = (payload) => http.post('/orders', payload);