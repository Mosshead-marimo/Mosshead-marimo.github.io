export type EstimateInput = { quantity: number; unitAmount: number; directCost: number; contingencyPercent: number; taxPercent: number; priceFloor: number };
export function calculateEstimate(input: EstimateInput) {
  const subtotal = Math.round(input.quantity * input.unitAmount);
  const contingency = Math.round(subtotal * input.contingencyPercent / 100);
  const tax = Math.round((subtotal + contingency) * input.taxPercent / 100);
  const total = subtotal + contingency + tax;
  const marginPercent = total ? (total - input.directCost) / total * 100 : 0;
  return { subtotal, contingency, tax, total, marginPercent, belowFloor: total < input.priceFloor };
}
