import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { MasteryBadge, type MasteryStatus } from '@/components/common/MasteryBadge';
import type { Dashboard } from '../api/dashboard';
import { percent } from '../model/format';

export function Panel({
  title,
  id,
  children,
  action,
}: {
  title: string;
  id: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 space-y-3 rounded-lg border p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** DASH-1: what needs attention now. */
export function StatTiles({
  counts,
  windowDays,
}: {
  counts: Dashboard['counts'];
  windowDays: number;
}) {
  const tiles = [
    { label: 'Due today', value: counts.dueToday, to: '/reviews' },
    { label: 'Overdue', value: counts.overdue, to: '/reviews?tab=overdue' },
    { label: 'New concepts available', value: counts.newAvailable, to: '/practice' },
    { label: `Sessions (${windowDays} days)`, value: counts.completedSessions },
    { label: 'Recurring misconceptions', value: counts.recurringMisconceptions, to: '/reviews' },
  ];
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5" aria-label="Summary">
      {tiles.map((tile) => (
        <li key={tile.label} className="rounded-lg border p-3">
          <p className="text-2xl font-semibold tabular-nums">{tile.value}</p>
          {tile.to ? (
            <Link
              to={tile.to}
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
            >
              {tile.label}
            </Link>
          ) : (
            <p className="text-sm text-muted-foreground">{tile.label}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** DASH-3: cold-recall accuracy, overall and per week. One series, so no legend; a table carries the values. */
export function AccuracyPanel({ data }: { data: Dashboard }) {
  const { coldAccuracy: overall, accuracyByWeek: weeks } = data;
  const width = 320;
  const height = 96;
  const gap = 6;
  const slot = (width - gap * (weeks.length - 1)) / weeks.length;
  const barWidth = Math.min(slot, 20);
  return (
    <Panel title="Cold-recall accuracy" id="accuracy">
      <p className="text-sm text-muted-foreground">
        Answers from memory only. Corrections and re-practice after reading are excluded.
      </p>
      <div className="flex flex-wrap items-end gap-6">
        <div>
          <p className="text-3xl font-semibold tabular-nums">{percent(overall.strict)}</p>
          <p className="text-xs text-muted-foreground">
            {overall.pass} of {overall.n} passed in {data.windowDays} days ·{' '}
            {percent(overall.lenient)} counting Partial as half
          </p>
        </div>
        <svg
          viewBox={`0 0 ${width} ${height + 16}`}
          className="h-28 w-full max-w-sm"
          role="img"
          aria-label="Weekly cold-recall accuracy, last 8 weeks (values in the table below)"
        >
          <line
            x1="0"
            x2={width}
            y1={height}
            y2={height}
            className="stroke-border"
            strokeWidth="1"
          />
          {weeks.map((week, i) => {
            const value = week.strict ?? 0;
            const h = week.n === 0 ? 0 : Math.max(2, value * height);
            const x = i * (slot + gap) + (slot - barWidth) / 2;
            return (
              <g key={week.weekStart}>
                <title>{`Week of ${week.weekStart}: ${percent(week.strict)} (${week.n} cold answers)`}</title>
                {/* A full-height transparent hit target makes hover work on short and empty bars. */}
                <rect x={i * (slot + gap)} y={0} width={slot} height={height} fill="transparent" />
                {week.n > 0 ? (
                  <rect
                    x={x}
                    y={height - h}
                    width={barWidth}
                    height={h}
                    rx={4}
                    className="fill-primary"
                  />
                ) : null}
                <text
                  x={x + barWidth / 2}
                  y={height + 12}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[9px]"
                >
                  {week.weekStart.slice(5)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <thead>
            <tr className="text-muted-foreground">
              <th className="font-normal">Week of</th>
              <th className="font-normal">Accuracy</th>
              <th className="font-normal">Cold answers</th>
            </tr>
          </thead>
          <tbody>
            {weeks.map((week) => (
              <tr key={week.weekStart}>
                <td>{week.weekStart}</td>
                <td>{percent(week.strict)}</td>
                <td>{week.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <table className="w-full text-left text-sm">
        <caption className="mb-1 text-left text-xs text-muted-foreground">
          By days since the previous cold review
        </caption>
        <thead>
          <tr className="text-muted-foreground">
            {data.retentionByInterval.map((row) => (
              <th key={row.bucket} className="font-normal">
                {row.bucket === '1' ? '≤1 day' : `${row.bucket} days`}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {data.retentionByInterval.map((row) => (
              <td key={row.bucket} className="tabular-nums">
                {percent(row.strict)}{' '}
                <span className="text-xs text-muted-foreground">n={row.n}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </Panel>
  );
}

const STATUSES: MasteryStatus[] = ['new', 'learning', 'reviewing', 'mastered', 'lapsed'];

/** DASH-4: concepts by mastery status, as labeled proportional bars. */
export function MasteryPanel({ distribution }: { distribution: Dashboard['masteryDistribution'] }) {
  const total = STATUSES.reduce((sum, s) => sum + (distribution[s] ?? 0), 0);
  return (
    <Panel title="Concepts by mastery" id="mastery">
      <ul className="space-y-2">
        {STATUSES.map((s) => {
          const count = distribution[s] ?? 0;
          return (
            <li key={s} className="grid grid-cols-[6.5rem_1fr_2.5rem] items-center gap-3 text-sm">
              <MasteryBadge status={s} />
              <div className="h-2 rounded-full bg-muted" aria-hidden>
                <div
                  className="h-2 rounded-full bg-primary"
                  style={{ width: total ? `${(count / total) * 100}%` : 0 }}
                />
              </div>
              <span className="text-right tabular-nums">{count}</span>
            </li>
          );
        })}
      </ul>
    </Panel>
  );
}

/** DASH-5: weakest concepts by Weak Box priority. */
export function WeakestPanel({ weakest }: { weakest: Dashboard['weakest'] }) {
  return (
    <Panel
      title="Weakest concepts"
      id="weakest"
      action={
        <Link to="/reviews" className="text-sm underline underline-offset-2">
          Open Weak Box
        </Link>
      }
    >
      {weakest.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Answer a few questions to see your weakest concepts.
        </p>
      ) : (
        <ol className="space-y-2 text-sm">
          {weakest.map((w) => (
            <li key={w.conceptId} className="flex flex-wrap items-center gap-2">
              <Link
                to={`/services/${w.serviceSlug}`}
                className="font-medium underline-offset-2 hover:underline"
              >
                {w.conceptTitle}
              </Link>
              <span className="text-muted-foreground">{w.serviceName}</span>
              <MasteryBadge status={w.masteryStatus} />
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

/** DASH-6: coverage and performance per exam domain. */
export function DomainsPanel({ data }: { data: Dashboard }) {
  return (
    <Panel
      title={`Exam domains${data.certification ? ` · ${data.certification.code}-${data.certification.examVersion}` : ''}`}
      id="domains"
    >
      {data.domains.length === 0 ? (
        <p className="text-sm text-muted-foreground">No certification is set up yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[28rem] text-left text-sm [&_td]:pr-3 [&_th]:pr-3 [&_th]:whitespace-nowrap">
            <thead>
              <tr className="text-muted-foreground">
                <th className="font-normal">Domain</th>
                <th className="font-normal">Weight</th>
                <th className="font-normal">Coverage</th>
                <th className="font-normal">Accuracy ({data.windowDays} d)</th>
              </tr>
            </thead>
            <tbody>
              {data.domains.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="py-1.5">
                    {d.code} {d.name}
                  </td>
                  <td className="tabular-nums">{Math.round(d.weightPct)}%</td>
                  <td className="tabular-nums">
                    {percent(d.coverage)}{' '}
                    <span className="text-xs text-muted-foreground">
                      {d.covered}/{d.published}
                    </span>
                  </td>
                  <td className="tabular-nums">
                    {percent(d.performance.strict)}{' '}
                    <span className="text-xs text-muted-foreground">n={d.performance.n}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.dimensionAccuracy.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          By dimension:{' '}
          {data.dimensionAccuracy
            .map((d) => `${d.dimension.replace('_', ' ')} ${percent(d.strict)} (n=${d.n})`)
            .join(' · ')}
        </p>
      ) : null}
    </Panel>
  );
}

/** DASH-7: readiness is always labeled as an estimate and hidden until there is enough data. */
export function ReadinessPanel({ readiness }: { readiness: Dashboard['readiness'] }) {
  return (
    <Panel title="Readiness" id="readiness">
      <p className="text-sm font-medium">{readiness.label}</p>
      {readiness.visible ? (
        <p className="text-3xl font-semibold tabular-nums">{percent(readiness.value)}</p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Shown after {readiness.threshold} cold answers in this certification (
          {readiness.coldAttempts} so far).
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Weighted by exam-domain share: coverage × accuracy on reviews at least 7 days apart. Based
        on {readiness.coldAttempts} cold answers.
      </p>
    </Panel>
  );
}

/** DASH-2: recent activity. */
export function ActivityPanel({ data }: { data: Dashboard }) {
  const describe = (item: Dashboard['recentActivity'][number]) => {
    switch (item.type) {
      case 'attempt':
        return `${item.isCold ? 'Cold answer' : 'Answer'}: ${item.conceptTitle ?? ''} — ${item.grade ? item.grade[0]?.toUpperCase() + item.grade.slice(1) : 'ungraded'}`;
      case 'override':
        return `Rescheduled ${item.conceptTitle ?? ''}${item.reason ? ` (${item.reason})` : ''}`;
      case 'session':
        return 'Completed a practice session';
      case 'published':
        return `Published ${item.conceptTitle ?? ''}`;
    }
  };
  return (
    <Panel title="Recent activity" id="activity">
      {data.recentActivity.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing yet.</p>
      ) : (
        <ol className="space-y-1 text-sm">
          {data.recentActivity.map((item, i) => (
            <li key={`${item.type}-${item.at}-${i}`} className="flex justify-between gap-3">
              <span>{describe(item)}</span>
              <time dateTime={item.at} className="shrink-0 text-xs text-muted-foreground">
                {new Intl.DateTimeFormat(undefined, {
                  month: 'short',
                  day: 'numeric',
                  timeZone: data.timezone,
                }).format(new Date(item.at))}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
