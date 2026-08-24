import { z } from "zod";

export const chatSchema = z.object({
  message: z.string().trim().min(2).max(1200),
  sessionId: z.string().uuid(),
  history: z.array(z.object({ role: z.enum(["user","assistant"]), content: z.string().max(2000) })).max(8).default([]),
});

export const proposalRenderSchema = z.object({ proposalId: z.string().uuid() });
export const messageIdsSchema = z.object({ messageIds: z.array(z.string().uuid()).min(1).max(100) });
export const contentPublishSchema = z.object({ contentId: z.string().uuid() });

export function parseBody<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error("Invalid request"), { statusCode: 400, details: result.error.flatten() });
  return result.data;
}
