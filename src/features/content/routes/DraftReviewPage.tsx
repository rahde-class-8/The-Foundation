import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Markdown } from '@/components/common/Markdown';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { TrustBadge } from '@/components/common/ContentBadges';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  getDomains,
  getDraft,
  publishDraft,
  rejectDraft,
  saveDraft,
  type DraftEdits,
} from '../api/content';
import type { Draft } from '../api/schemas';
import { contentKeys } from '../hooks/useContent';
import { CHECKLIST } from '../model/checklist';

const areaClass = 'w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm';

export function DraftReviewPage() {
  const { id = '' } = useParams();
  const query = useQuery({ queryKey: contentKeys.draft(id), queryFn: () => getDraft(id) });
  const domains = useQuery({ queryKey: ['content', 'domains'], queryFn: getDomains });
  return (
    <>
      <PageHeader
        title="Review draft"
        description="Check every claim against the cited passages before approving."
      />
      <p className="mb-4 text-sm">
        <Link to="/content?tab=drafts" className="underline underline-offset-2">
          Back to drafts
        </Link>
      </p>
      <QueryBoundary query={query} loadingLabel="Loading the draft…">
        {(draft) => (
          <ReviewForm
            key={draft.id + draft.questions.map((q) => q.version).join()}
            draft={draft}
            domains={domains.data ?? []}
          />
        )}
      </QueryBoundary>
    </>
  );
}

function toEdits(draft: Draft): DraftEdits {
  return {
    title: draft.title,
    summaryMd: draft.summaryMd ?? '',
    explanationMd: draft.explanationMd ?? '',
    limitationsMd: draft.limitationsMd ?? '',
    domainIds: draft.domainIds,
    questions: draft.questions.map(
      ({ id, dimension, difficulty, promptMd, referenceAnswerMd, rubric }) => ({
        id,
        dimension,
        difficulty,
        promptMd,
        referenceAnswerMd,
        rubric,
      }),
    ),
  };
}

function ReviewForm({
  draft,
  domains,
}: {
  draft: Draft;
  domains: { id: string; code: string; name: string; certification: string }[];
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [edits, setEdits] = useState<DraftEdits>(() => toEdits(draft));
  const [checked, setChecked] = useState<boolean[]>(() => CHECKLIST.map(() => false));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'error' | 'ok'; text: string } | null>(null);
  const editable = draft.status === 'draft' || draft.status === 'in_review';
  const official = draft.citations.some((c) => c.trustTier === 'official');

  const setQuestion = (index: number, patch: Partial<DraftEdits['questions'][number]>) =>
    setEdits((e) => ({
      ...e,
      questions: e.questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    }));
  const setPoint = (
    qi: number,
    pi: number,
    patch: Partial<DraftEdits['questions'][number]['rubric']['points'][number]>,
  ) =>
    setEdits((e) => ({
      ...e,
      questions: e.questions.map((q, i) =>
        i === qi
          ? {
              ...q,
              rubric: {
                ...q.rubric,
                points: q.rubric.points.map((p, j) => (j === pi ? { ...p, ...patch } : p)),
              },
            }
          : q,
      ),
    }));

  async function act(action: 'save' | 'publish' | 'reject', event?: FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      if (action === 'reject') {
        await rejectDraft(draft.id);
        await queryClient.invalidateQueries({ queryKey: ['content'] });
        navigate('/content?tab=drafts');
        return;
      }
      await saveDraft(draft.id, edits);
      if (action === 'publish') {
        await publishDraft(draft.id);
        await queryClient.invalidateQueries({ queryKey: ['content'] });
        navigate(`/services/${draft.service.slug}`);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: contentKeys.draft(draft.id) });
      setMessage({ kind: 'ok', text: 'Draft saved.' });
    } catch (cause) {
      setMessage({
        kind: 'error',
        text: cause instanceof Error ? cause.message : 'Something went wrong.',
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void act('save', event)} className="grid gap-6 lg:grid-cols-2">
      <div className="min-w-0 space-y-4">
        <p className="text-sm text-muted-foreground">
          {draft.service.name} · {draft.origin === 'ai_draft' ? 'AI draft' : 'Draft'}
        </p>
        <Field id="title" label="Title">
          <Input
            id="title"
            required
            maxLength={200}
            value={edits.title}
            disabled={!editable}
            onChange={(e) => setEdits({ ...edits, title: e.target.value })}
          />
        </Field>
        <Field id="summary" label="Summary">
          <textarea
            id="summary"
            rows={2}
            maxLength={600}
            className={areaClass}
            value={edits.summaryMd}
            disabled={!editable}
            onChange={(e) => setEdits({ ...edits, summaryMd: e.target.value })}
          />
        </Field>
        <Field id="explanation" label="Explanation">
          <textarea
            id="explanation"
            rows={6}
            maxLength={8000}
            className={areaClass}
            value={edits.explanationMd}
            disabled={!editable}
            onChange={(e) => setEdits({ ...edits, explanationMd: e.target.value })}
          />
        </Field>
        <Field id="limitations" label="What it does not do">
          <textarea
            id="limitations"
            rows={3}
            maxLength={4000}
            className={areaClass}
            value={edits.limitationsMd}
            disabled={!editable}
            onChange={(e) => setEdits({ ...edits, limitationsMd: e.target.value })}
          />
        </Field>
        {domains.length > 0 ? (
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Exam domains</legend>
            {domains.map((d) => (
              <label key={d.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!editable}
                  checked={edits.domainIds.includes(d.id)}
                  onChange={(e) =>
                    setEdits({
                      ...edits,
                      domainIds: e.target.checked
                        ? [...edits.domainIds, d.id]
                        : edits.domainIds.filter((x) => x !== d.id),
                    })
                  }
                />
                {d.certification} {d.code} {d.name}
              </label>
            ))}
          </fieldset>
        ) : null}

        {edits.questions.map((q, qi) => (
          <fieldset key={q.id} className="space-y-3 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">Question {qi + 1}</legend>
            <Field id={`q${qi}-prompt`} label="Prompt">
              <textarea
                id={`q${qi}-prompt`}
                rows={2}
                maxLength={2000}
                className={areaClass}
                value={q.promptMd}
                disabled={!editable}
                onChange={(e) => setQuestion(qi, { promptMd: e.target.value })}
              />
            </Field>
            <Field id={`q${qi}-answer`} label="Reference answer">
              <textarea
                id={`q${qi}-answer`}
                rows={3}
                maxLength={4000}
                className={areaClass}
                value={q.referenceAnswerMd}
                disabled={!editable}
                onChange={(e) => setQuestion(qi, { referenceAnswerMd: e.target.value })}
              />
            </Field>
            <div className="space-y-2">
              <p className="text-sm font-medium">Rubric points</p>
              {q.rubric.points.map((p, pi) => (
                <div key={p.id} className="flex flex-wrap items-center gap-2">
                  <Input
                    aria-label={`Question ${qi + 1} point ${pi + 1}`}
                    className="min-w-0 flex-1"
                    value={p.text}
                    disabled={!editable}
                    onChange={(e) => setPoint(qi, pi, { text: e.target.value })}
                  />
                  <label className="flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={p.critical}
                      disabled={!editable}
                      onChange={(e) => setPoint(qi, pi, { critical: e.target.checked })}
                    />
                    Critical
                  </label>
                </div>
              ))}
            </div>
          </fieldset>
        ))}

        {editable ? (
          <fieldset className="space-y-1.5 rounded-md border p-3">
            <legend className="px-1 text-sm font-semibold">Review checklist</legend>
            {CHECKLIST.map((item, i) => (
              <label key={item} className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={checked[i] ?? false}
                  onChange={(e) =>
                    setChecked((c) => c.map((v, j) => (j === i ? e.target.checked : v)))
                  }
                />
                {item}
              </label>
            ))}
          </fieldset>
        ) : null}
        {message ? (
          <p
            role={message.kind === 'error' ? 'alert' : 'status'}
            className={message.kind === 'error' ? 'text-sm text-destructive' : 'text-sm'}
          >
            {message.text}
          </p>
        ) : null}
        {editable ? (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy || !checked.every(Boolean)}
              onClick={() => void act('publish')}
            >
              Approve and publish
            </Button>
            <Button type="submit" variant="outline" disabled={busy}>
              Save draft
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => void act('reject')}
            >
              Reject
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">This concept is {draft.status}.</p>
        )}
      </div>

      <aside aria-labelledby="cited-heading" className="min-w-0 space-y-3">
        <h2 id="cited-heading" className="text-lg font-semibold">
          Cited passages
        </h2>
        {!official ? (
          <p className="rounded-md border px-3 py-2 text-sm">
            <TrustBadge tier="personal" /> Not verified against AWS docs. Add an official citation
            before relying on limits or numbers.
          </p>
        ) : null}
        <ul className="space-y-2">
          {draft.citations.map((c) => (
            <li
              key={`${c.passageId}-${c.supportType}`}
              className="space-y-1 rounded-md border p-3 text-sm"
            >
              <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <TrustBadge tier={c.trustTier} />
                <span>{c.sourceTitle}</span>
                {c.pageStart ? (
                  <span>
                    page {c.pageStart}
                    {c.pageEnd && c.pageEnd !== c.pageStart ? `–${c.pageEnd}` : ''}
                  </span>
                ) : null}
                <span>{c.supportType}</span>
              </p>
              <Markdown>{c.text}</Markdown>
            </li>
          ))}
        </ul>
      </aside>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
