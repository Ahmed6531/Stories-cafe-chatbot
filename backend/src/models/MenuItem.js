/*import mongoose from "mongoose";

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

export const MenuItem = mongoose.model("MenuItem", MenuItemSchema);*/

import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    id: {
      type: Number,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    image: {
      type: String,
      required: false,
      default: "",
    },
    category: {
      type: String,
      required: true,
    },
    subcategory: {
      type: String,
      default: null,
    },
    description: {
      type: String,
      required: true,
    },
    basePrice: {
      type: Number,
      required: true,
      min: 0,
    },
    isAvailable: {
      type: Boolean,
      default: true,
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    // Ordered list of variant group IDs attached to this item
    variantGroups: [
      {
        type: String,
        required: false,
      },
    ],
  },
  {
    timestamps: true,
  },
);

export const MenuItem = mongoose.model("MenuItem", menuItemSchema);
