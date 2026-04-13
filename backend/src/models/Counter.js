import mongoose from "mongoose";

/**
 * Counter — atomic sequence generator.
 *
 * One document per counter, identified by _id string.
 * Used by menu.controller.js to issue collision-free numeric item IDs.
 *
 * Shape:  { _id: "menuItemId", seq: <number> }
 *
 * The document is created on first use (upsert) and the seq field
 * is seeded from the current highest MenuItem.id so existing data
 * is never disrupted.
 */
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

export const Counter = mongoose.model("Counter", counterSchema);