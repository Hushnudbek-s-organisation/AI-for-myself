/**
 * Best-effort extraction of text from simple (uncompressed) PDFs.
 * Scanned / compressed PDFs return partial=true so the UI does not pretend
 * the whole document was read.
 */
export function extractPdfText(buffer: Buffer): { text: string; partial: boolean; pagesHint: number } {
  const latin = buffer.toString("latin1");
  const pagesHint = Math.max(1, (latin.match(/\/Type\s*\/Page[^s]/g) || []).length);
  const chunks: string[] = [];

  const paren = /\((?:\\.|[^\\)]){2,}\)/g;
  let m: RegExpExecArray | null;
  while ((m = paren.exec(latin))) {
    const inner = m[0].slice(1, -1);
    const decoded = inner
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\\(/g, "(")
      .replace(/\\\)/g, ")")
      .replace(/\\(\d{3})/g, (_, oct) => String.fromCharCode(parseInt(oct, 8)))
      .replace(/\\./g, "");
    if (/[A-Za-z]{3,}/.test(decoded)) chunks.push(decoded);
  }

  const tj = /\[(.*?)\]\s*TJ/gs;
  while ((m = tj.exec(latin))) {
    const parts = m[1].match(/\((?:\\.|[^\\)])*\)/g) || [];
    const line = parts
      .map((p) => p.slice(1, -1).replace(/\\n/g, " ").replace(/\\\(/g, "(").replace(/\\\)/g, ")"))
      .join("");
    if (/[A-Za-z]{3,}/.test(line)) chunks.push(line);
  }

  const text = chunks.join(" ").replace(/\s+/g, " ").trim().slice(0, 40_000);
  const partial = text.length < 80 || /FlateDecode/.test(latin);
  return { text, partial, pagesHint };
}
