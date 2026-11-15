// All requirement text, model output and repository content must cross this boundary.
export const esc = (value: unknown) => String(value).replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
