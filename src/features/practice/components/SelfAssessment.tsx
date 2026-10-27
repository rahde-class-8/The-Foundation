import { useMemo, useState } from 'react';
import { RubricV1Schema } from '@core/grading/rubric.ts';
import { suggestGradeFromTicks, type Tick } from '@core/grading/self.ts';
import type { Grade, Reference } from '../api/schemas';
import { GradeButtons } from './GradeButtons';
import { ReferencePanel } from './ReferencePanel';

const TICKS: { value: Tick; label: string }[] = [
  { value: 'covered', label: 'Covered' },
  { value: 'partial', label: 'Partly' },
  { value: 'missing', label: 'Missing' },
];

/** Reference answer plus a rubric checklist that suggests a grade (GRADING_RUBRICS §6). */
export function SelfAssessment({
  reference,
  intro,
  onGrade,
  busy,
}: {
  reference: Reference;
  intro: string;
  onGrade: (grade: Grade, ticks: Record<string, Tick>) => void;
  busy: boolean;
}) {
  const [ticks, setTicks] = useState<Record<string, Tick>>({});
  const rubric = useMemo(
    () => RubricV1Schema.safeParse({ schemaVersion: 1, ...reference.rubric }),
    [reference],
  );
  const complete = reference.rubric.points.every((p) => ticks[p.id]);
  const suggested = rubric.success && complete ? suggestGradeFromTicks(rubric.data, ticks) : null;

  return (
    <section aria-labelledby="self-assess" className="space-y-4">
      <h2 id="self-assess" className="text-lg font-semibold">
        Grade it yourself
      </h2>
      <p className="text-sm text-muted-foreground">{intro}</p>
      <ReferencePanel reference={reference} open />
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Which points did your answer cover?</legend>
        {reference.rubric.points.map((point) => (
          <div key={point.id} className="space-y-1.5 rounded-md border p-3">
            <p className="text-sm">
              {point.text}
              {point.critical ? (
                <span className="ml-2 text-xs text-muted-foreground">(essential)</span>
              ) : null}
            </p>
            <div role="radiogroup" aria-label={point.text} className="flex flex-wrap gap-3">
              {TICKS.map((tick) => (
                <label key={tick.value} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name={`tick-${point.id}`}
                    value={tick.value}
                    checked={ticks[point.id] === tick.value}
                    onChange={() => setTicks((current) => ({ ...current, [point.id]: tick.value }))}
                  />
                  {tick.label}
                </label>
              ))}
            </div>
          </div>
        ))}
      </fieldset>
      {suggested ? (
        <p className="text-sm">
          Suggested grade from your checklist: <strong className="capitalize">{suggested}</strong>
        </p>
      ) : null}
      <GradeButtons
        suggested={suggested}
        disabled={busy}
        onGrade={(grade) => onGrade(grade, ticks)}
      />
    </section>
  );
}
