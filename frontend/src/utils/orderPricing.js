export function calculateOrderTotals(items = [], taxRate = 0.08) {
  const subtotal = items.reduce((total, item) => total + (item.price || 0) * item.qty, 0)
  const tax = Math.round(subtotal * taxRate)
  const total = subtotal + tax

  return {
    subtotal,
    tax,
    total,
  }
}

export const calculateOrderPricing = calculateOrderTotals
