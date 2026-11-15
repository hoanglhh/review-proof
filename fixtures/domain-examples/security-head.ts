// SYNTHETIC only. The session must come from server authentication, never from request JSON.
export function readDocument(session: unknown, document: unknown):
  { ok: true; body: string } | { ok: false; error: string } {
  if (typeof session !== "object" || session === null || Array.isArray(session)
    || !("userId" in session) || typeof session.userId !== "string" || !session.userId.trim()
    || typeof document !== "object" || document === null || Array.isArray(document)
    || !("id" in document) || typeof document.id !== "string" || !document.id.trim()
    || !("ownerId" in document) || typeof document.ownerId !== "string" || !document.ownerId.trim()
    || !("body" in document) || typeof document.body !== "string"
    || document.ownerId !== session.userId) {
    return { ok: false, error: "Document unavailable" };
  }
  return { ok: true, body: document.body };
}
