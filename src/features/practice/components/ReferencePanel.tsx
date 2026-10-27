import { Markdown } from '@/components/common/Markdown';
import type { Reference } from '../api/schemas';

export function ReferencePanel({ reference, open }: { reference: Reference; open?: boolean }) {
  return (
    <details open={open} className="rounded-md border p-3">
      <summary className="cursor-pointer text-sm font-medium">Reference answer</summary>
      <div className="mt-3">
        <Markdown>{reference.referenceAnswerMd}</Markdown>
      </div>
    </details>
  );
}
