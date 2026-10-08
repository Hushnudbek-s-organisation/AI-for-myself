import fs from "node:fs";
import path from "node:path";
import { MAX_UPLOAD_BYTES } from "@/core/types";
import { AetherError } from "@/core/errors";
import { extractPdfText } from "@/core/pdf";

const ALLOWED_EXT = new Set([".txt", ".md", ".csv", ".json", ".docx", ".pdf", ".png", ".jpg", ".jpeg", ".webp"]);
const ALLOWED_MIME = new Set([
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/json",
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/octet-stream",
]);

export interface ExtractResult {
  text: string;
  partial: boolean;
  storedPath?: string;
}

function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export async function extractText(file: File): Promise<ExtractResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new AetherError("file_too_large", "File exceeds 8MB limit", 413);
  }
  const mime = file.type || "application/octet-stream";
  const name = file.name.toLowerCase();
  const ext = extOf(name);
  if (!ALLOWED_EXT.has(ext) && !ALLOWED_MIME.has(mime)) {
    throw new AetherError("bad_request", "File type is not allowed", 400);
  }
  if (ext === ".exe" || ext === ".js" || ext === ".html" || ext === ".htm") {
    throw new AetherError("bad_request", "File type is not allowed", 400);
  }

  if (
    mime.startsWith("text/") ||
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    name.endsWith(".csv") ||
    name.endsWith(".json")
  ) {
    return { text: (await file.text()).slice(0, 40_000), partial: false };
  }
  if (name.endsWith(".docx") || mime.includes("wordprocessingml")) {
    const mammoth = await import("mammoth");
    const buf = Buffer.from(await file.arrayBuffer());
    const res = await mammoth.extractRawText({ buffer: buf });
    return { text: (res.value || "").slice(0, 40_000), partial: false };
  }
  if (name.endsWith(".pdf") || mime === "application/pdf") {
    const buf = Buffer.from(await file.arrayBuffer());
    const pdf = extractPdfText(buf);
    const note = pdf.partial
      ? `\n\n[PARTIAL EXTRACTION: this PDF looks compressed or scanned. Aether did not read every page. Paste key passages if needed. Pages hint: ${pdf.pagesHint}]`
      : "";
    return {
      text: (pdf.text || `[PDF uploaded: ${file.name}]`) + note,
      partial: pdf.partial,
    };
  }
  if (mime.startsWith("image/")) {
    return {
      text: `[Image uploaded: ${file.name}. OCR is not enabled. Describe what you need analysed.]`,
      partial: true,
    };
  }
  return {
    text: `[File uploaded: ${file.name} (${mime || "unknown type"}). Binary content not extracted.]`,
    partial: true,
  };
}

export function persistUpload(userId: string, fileId: string, filename: string, data: Buffer): string {
  const dir = path.join(process.cwd(), "data", "uploads", userId);
  fs.mkdirSync(dir, { recursive: true });
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  const stored = path.join(dir, `${fileId}_${safe}`);
  fs.writeFileSync(stored, data);
  return stored;
}
