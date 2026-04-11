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
    // Category this group belongs to. Optional at the schema level so the
    // migration script can assign it without a validation race; the seed
    // script always sets this. Will be tightened to required after
    // production migration is confirmed clean.
    categoryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      required: false,
    },
    // Legacy alias kept temporarily so pre-refactor records that still use
    // `ctagId` remain readable until the backfill is complete.
    ctagId: {
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

variantGroupSchema.pre("validate", function syncCategoryAliases() {
  if (!this.categoryId && this.ctagId) {
    this.categoryId = this.ctagId;
  }

  if (!this.ctagId && this.categoryId) {
    this.ctagId = this.categoryId;
  }
});

export const VariantGroup = mongoose.model("VariantGroup", variantGroupSchema);
