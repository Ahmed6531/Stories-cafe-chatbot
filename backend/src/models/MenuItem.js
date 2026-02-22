import mongoose from "mongoose";

const OptionSchema = new mongoose.Schema(
  {
    label: String,
    priceDelta: { type: Number, default: 0 }
  },
  { _id: false }
);

const MenuItemSchema = new mongoose.Schema(
  {
    id: { type: Number, unique: true },
    slug: { type: String, unique: true },
    name: String,
    description: String,
    basePrice: Number,
    category: String,
    options: [OptionSchema],
    isFeatured: Boolean,
    isAvailable: { type: Boolean, default: true }
  },
  { timestamps: true }
);

export const MenuItem = mongoose.model("MenuItem", MenuItemSchema);
