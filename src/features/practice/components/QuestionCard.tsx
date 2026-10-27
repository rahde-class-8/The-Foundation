import { Markdown } from '@/components/common/Markdown';
import { Badge } from '@/components/ui/badge';

const DIMENSION_LABEL: Record<string, string> = {
  what: 'What it is',
  how: 'How it works',
  problem: 'Problem it solves',
  solution: 'How it solves it',
  not_do: 'What it does NOT do',
  when: 'When to choose it',
  where: 'Where it belongs',
  trade_offs: 'Trade-offs',
};

export function QuestionCard({
  serviceName,
  conceptTitle,
  dimension,
  promptMd,
}: {
  serviceName: string;
  conceptTitle: string;
  dimension: string;
  promptMd: string;
}) {
  return (
    <section aria-labelledby="question" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <span>
          {serviceName} · {conceptTitle}
        </span>
        <Badge variant="outline">{DIMENSION_LABEL[dimension] ?? dimension}</Badge>
      </div>
      <h2 id="question" className="sr-only">
        Question
      </h2>
      <Markdown className="text-base">{promptMd}</Markdown>
    </section>
  );
}
