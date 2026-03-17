import mongoose from "mongoose";

const SelectedOptionSchema = new mongoose.Schema(
  {
    optionName: { type: String, required: true, trim: true },
    suboptionName: { type: String, trim: true, default: undefined },
  },
  { _id: false },
);

const CartItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: Number, required: true },
    qty: { type: Number, required: true, min: 1 },
    selectedOptions: { type: [SelectedOptionSchema], default: [] },
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
