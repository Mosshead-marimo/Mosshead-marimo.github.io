import type { VercelResponse } from "@vercel/node";

export function fail(res: VercelResponse, error: unknown) {
  const e = error as { statusCode?: number; message?: string; details?: unknown };
  const status = e.statusCode && e.statusCode >= 400 && e.statusCode < 600 ? e.statusCode : 500;
  if (status === 500) console.error(error);
  res.status(status).json({ error: status === 500 ? "The request could not be completed" : e.message, details: e.details });
}

export const cents = (amount: number, currency: string) => new Intl.NumberFormat("en-US", { style: "currency", currency }).format(amount / 100);
