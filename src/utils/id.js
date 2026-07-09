/** Validate id (UUID v4) trước khi ghép vào đường dẫn file — chống path traversal. */
export const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id);
}
