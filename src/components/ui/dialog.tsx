import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Button } from './button';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** 'drawer' slides in from the right edge; 'center' is a regular modal. */
  variant?: 'center' | 'drawer';
};

/**
 * Modal dialog on the native <dialog> element: focus trapping, Escape, and the inert backdrop come
 * from the browser.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  variant = 'center',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={() => open && onClose()}
      className={cn(
        'bg-background text-foreground backdrop:bg-black/40 open:flex flex-col gap-4 border p-5 shadow-lg',
        variant === 'drawer'
          ? 'm-0 ml-auto h-full max-h-none w-full max-w-lg overflow-y-auto'
          : 'm-auto w-[calc(100%-2rem)] max-w-md rounded-lg',
      )}
    >
      {open ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <h2 id={titleId} className="text-lg font-semibold">
                {title}
              </h2>
              {description ? (
                <div className="text-sm text-muted-foreground">{description}</div>
              ) : null}
            </div>
            <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
              ✕
            </Button>
          </div>
          {children}
        </>
      ) : null}
    </dialog>
  );
}
