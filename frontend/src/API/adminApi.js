import http from "./http";

export const adminLogin = async (credentials) => {
  const response = await http.post("/admin/login", credentials);
  return response.data;
};