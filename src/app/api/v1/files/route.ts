import { NextRequest } from "next/server";
import { authFromRequest, requireScope } from "@/lib/request-auth";
import { jsonError, jsonOk } from "@/lib/http";
import { extractText, persistUpload } from "@/lib/files";
import { files } from "@/db/repos";
import { ensureSeeded } from "@/db/seed";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    ensureSeeded();
    const auth = await authFromRequest(req);
    requireScope(auth, "files");
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(new Error("file field required"));
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const clone = new File([buf], file.name, { type: file.type });
    const extracted = await extractText(clone);
    const att = files.create({
      userId: auth.userId,
      filename: file.name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      extractedText: extracted.text,
    });
    try {
      persistUpload(auth.userId, att.id, file.name, buf);
    } catch {
      /* disk persist is best-effort; extracted text is in DB */
    }
    return jsonOk(
      {
        file: {
          ...att,
          partial: extracted.partial,
        },
      },
      201,
    );
  } catch (e) {
    return jsonError(e);
  }
}
