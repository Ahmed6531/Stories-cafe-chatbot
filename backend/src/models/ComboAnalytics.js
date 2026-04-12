import mongoose from "mongoose";

const comboAnalyticsSchema = new mongoose.Schema(
  {
    anchorMenuItemId: {
      type: Number,
      required: true,
      index: true,
    },
    suggestedMenuItemId: {
      type: Number,
      required: true,
      index: true,
    },
    count: {
      type: Number,
      required: true,
      default: 1,
      min: 1,
    },
    lastSeenAt: {
      type: Date,
      default: Date.now,
    },
    source: {
      type: String,
      default: "cart_add",
      trim: true,
    },
  },
  { timestamps: true },
);

comboAnalyticsSchema.index(
  { anchorMenuItemId: 1, suggestedMenuItemId: 1 },
  { unique: true },
);

comboAnalyticsSchema.index({ anchorMenuItemId: 1, count: -1, lastSeenAt: -1 });

export const ComboAnalytics = mongoose.model("ComboAnalytics", comboAnalyticsSchema);