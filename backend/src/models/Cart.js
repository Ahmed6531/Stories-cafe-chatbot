import mongoose from "mongoose";

const CartItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    qty: { type: Number, required: true, min: 1 },
    selectedOptions: { type: [String], default: [] }
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
