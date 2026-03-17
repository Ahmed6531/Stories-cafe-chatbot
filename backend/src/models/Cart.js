import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    // menuItemId can be either the numeric `id` from MenuItem or the MongoDB _id.
    // Using Mixed allows storing both without casting failures.
    menuItemId: { type: mongoose.Schema.Types.Mixed, required: true },
    qty: { type: Number, required: true, min: 1 },
    selectedOptions: { type: [String], default: [] },
    instructions: { type: String, default: "" }
  },
  { _id: true }
);

const CartSchema = new mongoose.Schema(
  {
    cartId: { type: String, required: true, unique: true, index: true },
    items: { type: [CartItemSchema], default: [] }
  },
  { timestamps: true }
);

export const Cart = mongoose.model("Cart", CartSchema);
