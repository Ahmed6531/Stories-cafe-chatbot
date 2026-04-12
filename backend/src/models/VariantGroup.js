import mongoose from "mongoose";

const suboptionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    additionalPrice: { type: Number, default: 0 },
  },
  { _id: false },
);

const variantOptionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  description: {
    type: String,
    required: false,
  },
  additionalPrice: {
    type: Number,
    required: true,
    default: 0,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  order: {
    type: Number,
    default: 0,
  },
  suboptionLabel: {
    type: String,
    required: false,
    trim: true,
    default: "",
  },
  suboptions: {
    type: [suboptionSchema],
    default: [],
  },
});

const variantGroupSchema = new mongoose.Schema(
  {
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: false,
    },
    refId: {
      type: String,
      required: false,
      unique: true,
      sparse: true,
      trim: true,
    },
    // Unique identifier for referencing (e.g., "coffee-size-standard")
    groupId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    // Admin-facing name — shown only in the dashboard
    adminName: {
      type: String,
      required: true,
    },
    // Customer-facing label — shown on the order form; falls back to adminName if empty
    customerLabel: {
      type: String,
      default: "",
    },
    // Legacy field — kept for backward compat; mirrors customerLabel || adminName
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
    },
    isRequired: {
      type: Boolean,
      default: false,
    },
    maxSelections: {
      type: Number,
      required: false,
      // null means unlimited selections
    },
    order: {
      type: Number,
      default: 0,
    },
    // Group-level active flag — soft delete: set false instead of removing the doc.
    isActive: {
      type: Boolean,
      default: true,
    },
    options: [variantOptionSchema],
  },
  {
    timestamps: true,
  },
);

export const VariantGroup = mongoose.model("VariantGroup", variantGroupSchema);
