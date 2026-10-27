const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'number',
  'password',
  'tel',
  'url',
  '',
]);

/** True when a key press is typing into a field, so single-key shortcuts must not fire. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target.closest('textarea, select')) return true;
  return target instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(target.type);
}
