// Unsent answers survive reloads on this device (REC-10). Storage can be unavailable; never throw.

export type Draft = { text: string; clientKey: string; startedAt: number };

const key = (scope: string) => `foundation:draft:${scope}`;

export function loadDraft(scope: string): Draft {
  try {
    const raw = localStorage.getItem(key(scope));
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Draft>;
      if (typeof parsed.text === 'string' && typeof parsed.clientKey === 'string') {
        return {
          text: parsed.text,
          clientKey: parsed.clientKey,
          startedAt: parsed.startedAt ?? Date.now(),
        };
      }
    }
  } catch {
    // Fall through to a fresh draft.
  }
  return { text: '', clientKey: crypto.randomUUID(), startedAt: Date.now() };
}

export function saveDraft(scope: string, draft: Draft): void {
  try {
    localStorage.setItem(key(scope), JSON.stringify(draft));
  } catch {
    // Storage full or blocked: the draft lives only in memory.
  }
}

export function clearDraft(scope: string): void {
  try {
    localStorage.removeItem(key(scope));
  } catch {
    // Nothing to clear.
  }
}
