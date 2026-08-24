import type { VercelRequest, VercelResponse } from "@vercel/node";
import PDFDocument from "pdfkit";
import { cors, requireAdmin, audit } from "../../lib/platform.js";
import { fail, cents } from "../../lib/http.js";
import { parseBody, proposalRenderSchema } from "../../lib/schemas.js";

export async function buildPdf(proposal: Record<string, any>) {
  const doc = new PDFDocument({ size: "A4", margin: 52, info: { Title: proposal.title, Author: "Kaushik Aadhithya Chiratanagandla" } });
  const chunks: Buffer[] = [];
  doc.on("data", chunk => chunks.push(Buffer.from(chunk)));
  const ready = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.rect(0, 0, 595, 842).fill("#08090b");
  doc.fillColor("#ff5a36").fontSize(10).text("KAUSHIK.AI / PROPOSAL", 52, 48, { characterSpacing: 1.6 });
  doc.fillColor("#ffffff").fontSize(30).text(proposal.title, 52, 88, { width: 490 });
  doc.fillColor("#a8abb2").fontSize(11).text(`Prepared for ${proposal.client_name}  •  ${proposal.proposal_number} v${proposal.version}`, 52, 150);
  doc.moveTo(52, 180).lineTo(543, 180).strokeColor("#34363d").stroke();
  const content = proposal.content || {};
  let y = 205;
  for (const [key, value] of Object.entries(content)) {
    if (value == null || value === "" || key === "internal_notes") continue;
    if (y > 730) { doc.addPage(); doc.rect(0, 0, 595, 842).fill("#08090b"); y = 52; }
    doc.fillColor("#ff5a36").fontSize(9).text(key.replaceAll("_", " ").toUpperCase(), 52, y, { characterSpacing: 1 }); y = doc.y + 8;
    doc.fillColor("#e9eaf0").fontSize(11).text(Array.isArray(value) ? value.map(x => `• ${x}`).join("\n") : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value), 52, y, { width: 490, lineGap: 4 }); y = doc.y + 20;
  }
  doc.fillColor("#ffffff").fontSize(16).text(`Investment: ${cents(proposal.total, proposal.currency)}`, 52, Math.min(y + 10, 760));
  doc.fillColor("#777b84").fontSize(8).text("Business terms should be reviewed with a qualified local professional where needed.", 52, 805, { width: 490 });
  doc.end();
  return ready;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (cors(req, res)) return;
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const admin = await requireAdmin(req, res); if (!admin) return;
    const { proposalId } = parseBody(proposalRenderSchema, req.body);
    const { data: proposal, error } = await admin.db.from("proposals").select("*").eq("id", proposalId).single();
    if (error || !proposal) return res.status(404).json({ error: "Proposal not found" });
    const pdf = await buildPdf(proposal);
    const path = `proposals/${proposal.proposal_number}-v${proposal.version}.pdf`;
    const { error: uploadError } = await admin.db.storage.from("portfolio-private").upload(path, pdf, { contentType: "application/pdf", upsert: true });
    if (uploadError) throw uploadError;
    await admin.db.from("proposals").update({ storage_path: path }).eq("id", proposalId);
    await audit(admin.db, admin.user.id, "render_pdf", "proposal", proposalId, { storage_path: path });
    const { data: signed } = await admin.db.storage.from("portfolio-private").createSignedUrl(path, 600);
    res.status(200).json({ path, downloadUrl: signed?.signedUrl });
  } catch (error) { fail(res, error); }
}
