import { redactSecrets } from "./security";
import type { ModeId } from "./types";

const FORBIDDEN = [
  /here is (the )?(hidden )?system prompt/i,
  /AETHER_SECRET/,
  /aether_sk_[A-Za-z0-9]{8,}/,
];

export function validateOutput(text: string, mode: ModeId): string {
  let out = redactSecrets(text);
  for (const re of FORBIDDEN) {
    if (re.test(out)) {
      out = "The draft response was blocked by the output validator (possible secret leakage). Please retry.";
      break;
    }
  }
  if (mode === "admission" && /\b(\d{1,2}|100)\s*%\s*(chance|admit|probability)/i.test(out)) {
    out +=
      "\n\n_(Validator note: numeric admission chances are not produced by Aether unless a chancing engine supplied them.)_";
  }
  if (mode === "visa" && /you will (definitely|certainly) (get|be granted) (the )?visa/i.test(out)) {
    out = out.replace(
      /you will (definitely|certainly) (get|be granted) (the )?visa/gi,
      "approval cannot be guaranteed",
    );
  }
  return out;
}
