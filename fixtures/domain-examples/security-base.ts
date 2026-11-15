// SYNTHETIC vulnerable example: authentication alone does not authorize reading another owner's document.
export function readDocument(session: unknown, document: unknown):
  { ok: true; body: string } | { ok: false; error: string } {
  if (typeof session !== "object" || session === null || Array.isArray(session)
    || !("userId" in session) || typeof session.userId !== "string" || !session.userId.trim()
    || typeof document !== "object" || document === null || Array.isArray(document)
    || !("id" in document) || typeof document.id !== "string" || !document.id.trim()
    || !("ownerId" in document) || typeof document.ownerId !== "string" || !document.ownerId.trim()
    || !("body" in document) || typeof document.body !== "string") {
    return { ok: false, error: "Document unavailable" };
  }
  return { ok: true, body: document.body };
}
