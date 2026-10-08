import { AppFrame } from "@/components/AppFrame";

export default function DocsPage() {
  return (
    <AppFrame title="API documentation">
      <div className="prose-aether max-w-3xl space-y-8 text-mist-100">
        <p>
          Aether’s public API hits the same AI Gateway as the web chat. Authenticate with a project API key. Never send
          a user identity header — the key is the identity.
        </p>
        <section>
          <h2 className="font-serif text-2xl">Authentication</h2>
          <pre className="mt-2 rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-xs">{`Authorization: Bearer aether_sk_…`}</pre>
          <p className="mt-2 text-sm text-mist-400">
            Raw keys are hashed at rest (SHA-256). Only a prefix is displayed after creation. Scopes: chat, stream,
            files, voice, tools, skills, memory.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">POST /v1/chat</h2>
          <pre className="mt-2 overflow-auto rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-xs">{`{
  "message": "Check my essay",
  "mode": "essay",
  "skill": "essay-coach",
  "conversationId": "optional",
  "context": { "degree": "Bachelor", "field": "CS" },
  "stream": false
}`}</pre>
          <p className="mt-2 text-sm text-mist-400">
            <code>context</code> is untrusted, size-limited, and never promoted to system instructions.
          </p>
          <pre className="mt-3 overflow-auto rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-xs">{`{
  "id": "msg_…",
  "message": "…",
  "conversationId": "conv_…",
  "mode": "essay",
  "skill": "essay-coach",
  "sources": [],
  "usage": { "inputTokens": 0, "outputTokens": 0, "latencyMs": 12, "model": "aether-engine-v1" }
}`}</pre>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Streaming</h2>
          <p className="text-sm text-mist-400">
            POST /v1/chat/stream (scope <code>stream</code>) returns SSE events: meta, token, tool, source, usage, done,
            error.
          </p>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Other endpoints</h2>
          <ul className="list-disc pl-5 text-sm text-mist-400">
            <li>GET/POST /v1/conversations</li>
            <li>GET/PATCH/DELETE /v1/conversations/:id</li>
            <li>GET /v1/conversations/:id/export?format=json|md|txt</li>
            <li>GET/POST /v1/skills · PATCH/DELETE /v1/skills/:id · POST /v1/skills/builder</li>
            <li>GET/POST /v1/prompts</li>
            <li>POST /v1/files</li>
            <li>GET /v1/models · GET /v1/usage · GET/POST /v1/projects · GET/POST /v1/keys</li>
          </ul>
        </section>
        <section>
          <h2 className="font-serif text-2xl">JavaScript</h2>
          <pre className="mt-2 overflow-auto rounded-xl border border-white/10 bg-ink-900 p-4 font-mono text-xs">{`const response = await fetch("/v1/chat", {
  method: "POST",
  headers: {
    Authorization: \`Bearer \${API_KEY}\`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "Hello", mode: "general" }),
});`}</pre>
        </section>
        <section>
          <h2 className="font-serif text-2xl">Errors</h2>
          <p className="text-sm text-mist-400">
            JSON body <code>{`{ "error": { "code", "message" } }`}</code>. 401 invalid key, 403 missing scope, 404
            conversation not found (never by id alone without auth), 429 rate limit, 400 skill rejected.
          </p>
        </section>
      </div>
    </AppFrame>
  );
}
