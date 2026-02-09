import React, { createContext, useContext, useEffect, useMemo, useReducer } from "react";
import { cartReducer, initialCartState } from "./cartReducer";
import * as cartApi from "../API/cartApi";

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [state, dispatch] = useReducer(cartReducer, initialCartState);

  async function refreshCart() {
    dispatch({ type: "CART_LOADING" });
    try {
      const data = await cartApi.getCart();
      dispatch({ type: "CART_LOADED", payload: data });
    } catch (e) {
      dispatch({ type: "CART_ERROR", payload: e?.response?.data?.error || e.message });
    }
  }

  async function addToCart(menuItemId, qty = 1, selectedOptions = []) {
    dispatch({ type: "CART_LOADING" });
    try {
      const data = await cartApi.addCartItem({ menuItemId, qty, selectedOptions });
      dispatch({ type: "CART_LOADED", payload: data });
    } catch (e) {
      dispatch({ type: "CART_ERROR", payload: e?.response?.data?.error || e.message });
    }
  }

  useEffect(() => {
    refreshCart();
  }, []);

  const value = useMemo(() => ({ cart: state, addToCart, refreshCart }), [state]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
