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
  suboptions: {
    type: [suboptionSchema],
    default: [],
  },
});

const variantGroupSchema = new mongoose.Schema(
  {
    // Unique identifier for referencing (e.g., "coffee-size-standard")
    groupId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
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
    options: [variantOptionSchema],
  },
  {
    timestamps: true,
  },
);

export const VariantGroup = mongoose.model("VariantGroup", variantGroupSchema);
