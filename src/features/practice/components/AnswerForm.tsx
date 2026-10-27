import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { clearDraft, loadDraft, saveDraft, type Draft } from '../model/drafts';

type Props = {
  draftScope: string;
  label: string;
  submitLabel: string;
  onSubmit: (answer: string, clientKey: string, durationMs: number) => Promise<void>;
  secondary?: React.ReactNode;
};

const MAX_LENGTH = 8000;

/** Answer box with local draft autosave and ⌘/Ctrl+Enter to submit (REC-3, REC-9). */
export function AnswerForm({ draftScope, label, submitLabel, onSubmit, secondary }: Props) {
  const [draft, setDraft] = useState<Draft>(() => loadDraft(draftScope));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  function update(text: string) {
    const next = { ...draft, text };
    setDraft(next);
    saveDraft(draftScope, next);
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const answer = draft.text.trim();
    if (!answer || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(answer, draft.clientKey, Date.now() - draft.startedAt);
      clearDraft(draftScope);
    } catch (cause) {
      // The draft and its client key are kept, so retrying cannot create a duplicate (REC-3b).
      setError(cause instanceof Error ? cause.message : 'Could not save your answer.');
      setSubmitting(false);
    }
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-3">
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        ref={ref}
        value={draft.text}
        onChange={(event) => update(event.target.value)}
        onKeyDown={onKeyDown}
        maxLength={MAX_LENGTH}
        rows={8}
        aria-describedby={`${id}-hint`}
        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
      />
      <p id={`${id}-hint`} className="text-xs text-muted-foreground">
        Answer from memory. Press ⌘/Ctrl + Enter to submit. Your draft is saved on this device.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error} Your answer is still here. Try again.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" disabled={submitting || draft.text.trim().length === 0}>
          {submitting ? 'Saving…' : submitLabel}
        </Button>
        {secondary}
      </div>
    </form>
  );
}
