import http from "./http";

export const getOrders = async () => {
  const response = await http.get("/orders");
  return response.data;
};