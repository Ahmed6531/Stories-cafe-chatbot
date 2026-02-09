import http from "./http";

export async function getCart() {
  const res = await http.get("/cart");
  return res.data; // { cartId, count, items }
}

export async function addCartItem({ menuItemId, qty = 1, selectedOptions = [] }) {
  const res = await http.post("/cart/items", { menuItemId, qty, selectedOptions });
  return res.data;
}
