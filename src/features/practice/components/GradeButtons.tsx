import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import type { Grade } from '../api/schemas';
import { isTypingTarget } from '../model/keyboard';

const OPTIONS: { grade: Grade; label: string; key: string }[] = [
  { grade: 'pass', label: 'Pass', key: '1' },
  { grade: 'partial', label: 'Partial', key: '2' },
  { grade: 'miss', label: 'Miss', key: '3' },
];

/** Pass / Partial / Miss with 1/2/3 shortcuts when focus is not in a text field (REC-9). */
export function GradeButtons({
  onGrade,
  suggested,
  disabled,
}: {
  onGrade: (grade: Grade) => void;
  suggested?: Grade | null;
  disabled?: boolean;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (
        disabled ||
        isTypingTarget(event.target) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
      )
        return;
      const option = OPTIONS.find((o) => o.key === event.key);
      if (option) {
        event.preventDefault();
        onGrade(option.grade);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onGrade, disabled]);

  return (
    <div role="group" aria-label="Your grade" className="flex flex-wrap gap-2">
      {OPTIONS.map((option) => (
        <Button
          key={option.grade}
          variant={suggested === option.grade ? 'default' : 'outline'}
          disabled={disabled}
          onClick={() => onGrade(option.grade)}
          aria-keyshortcuts={option.key}
        >
          {option.label}
          <span className="text-xs opacity-60">{option.key}</span>
        </Button>
      ))}
    </div>
  );
}
