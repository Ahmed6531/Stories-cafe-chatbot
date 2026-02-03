import mongoose from "mongoose";

const OrderItemSchema = new mongoose.Schema(
  {
    menuItemId: { type: mongoose.Schema.Types.ObjectId, ref: "MenuItem", required: true },
    name: { type: String, required: true },
    qty: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true },
    selectedOptions: { type: [String], default: [] },
    lineTotal: { type: Number, required: true }
  },
  { _id: false }
);

const OrderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ["received", "in_progress", "completed", "cancelled"],
      default: "received"
    },
    orderType: { type: String, enum: ["pickup", "dine_in", "delivery"], required: true },

    customer: {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      address: { type: String, default: "" }
    },

    notesToBarista: { type: String, default: "" },

    items: { type: [OrderItemSchema], required: true },
    subtotal: { type: Number, required: true },
    total: { type: Number, required: true },

    paymentMethod: { type: String, enum: ["pay_at_pickup"], default: "pay_at_pickup" }
  },
  { timestamps: true }
);

export const Order = mongoose.model("Order", OrderSchema);
