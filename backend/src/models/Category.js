import mongoose from "mongoose";

const subcategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, trim: true, lowercase: true },
    order: { type: Number, default: 0 },
  },
  { _id: false },
);

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
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
      default: "",
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
    // Ordered list of subcategories belonging to this category.
    // MenuItem.subcategory strings should match a slug here (enforced by
    // the admin UI, not a hard DB constraint — subcategory wiring is a
    // follow-up sprint).
    subcategories: {
      type: [subcategorySchema],
      default: [],
    },
  },
  { timestamps: true },
);

export const Category = mongoose.model("Category", categorySchema);
