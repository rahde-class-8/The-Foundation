import { useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import type { JobView } from '@core/contracts/content.ts';
import { TrustBadge } from '@/components/common/ContentBadges';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createNote, uploadPdf } from '../api/content';
import type { SourceRow } from '../api/schemas';
import { contentKeys } from '../hooks/useContent';
import { importErrorMessage, precheckFile } from '../model/upload';
import { JobStatus } from './JobStatus';

type Props = {
  sources: SourceRow[];
  jobs: Record<string, JobView>;
  onJob: (job: JobView, restart?: boolean) => Promise<void>;
};

/** Upload a PDF (with progress) and add notes; each source shows its import job (CNT-2, CNT-3). */
export function SourcesPanel({ sources, jobs, onJob }: Props) {
  const queryClient = useQueryClient();
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    const problem = await precheckFile(file);
    if (problem) {
      setError(importErrorMessage(problem));
      return;
    }
    try {
      setUploadPct(0);
      const job = await uploadPdf(file, file.name, setUploadPct);
      setUploadPct(null);
      await queryClient.invalidateQueries({ queryKey: contentKeys.overview });
      await onJob(job);
    } catch (cause) {
      setUploadPct(null);
      setError(cause instanceof Error ? cause.message : 'Upload failed.');
    }
  }

  return (
    <section aria-labelledby="sources-heading" className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="sources-heading" className="text-lg font-semibold">
          Your sources
        </h2>
        <Label
          htmlFor="pdf-upload"
          className="ml-auto inline-flex h-9 cursor-pointer items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground focus-within:ring-[3px] focus-within:ring-ring/50"
        >
          Upload PDF
          <input
            id="pdf-upload"
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            disabled={uploadPct !== null}
            onChange={(event) => {
              void onFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />
        </Label>
        <Button variant="outline" onClick={() => setNoteOpen(true)}>
          Add a note
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        PDFs up to 20 MB and 300 pages with selectable text. Your files and notes stay private.
      </p>
      {uploadPct !== null ? (
        <div
          role="progressbar"
          aria-label="Uploading"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={uploadPct}
          className="h-2 w-full max-w-sm rounded-full bg-muted"
        >
          <div className="h-2 rounded-full bg-primary" style={{ width: `${uploadPct}%` }} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {sources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No sources yet. Upload a PDF or add a note to start.
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Sources">
          {sources.map((source) => {
            const job = (source.job && jobs[source.job.id]) ?? source.job;
            const resumable = job && job.hasMore && !(job.id in jobs);
            return (
              <li
                key={source.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <p className="font-medium break-words">{source.title}</p>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <TrustBadge tier={source.trustTier} />
                    <span>{source.sourceType === 'user_note' ? 'Note' : 'PDF'}</span>
                    {source.pageCount ? <span>{source.pageCount} pages</span> : null}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {job ? <JobStatus job={job} label={source.title} /> : null}
                  {resumable ? (
                    <Button size="sm" variant="outline" onClick={() => void onJob(job)}>
                      Resume
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {noteOpen ? <NoteDialog onClose={() => setNoteOpen(false)} onJob={onJob} /> : null}
    </section>
  );
}

function NoteDialog({ onClose, onJob }: { onClose: () => void; onJob: Props['onJob'] }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const job = await createNote(title, body);
      await queryClient.invalidateQueries({ queryKey: contentKeys.overview });
      onClose();
      await onJob(job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the note.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title="Add a note"
      description="Markdown headings (#) start new passages."
    >
      <form onSubmit={(event) => void submit(event)} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="note-title">Title</Label>
          <Input
            id="note-title"
            required
            maxLength={300}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="note-body">Note</Label>
          <textarea
            id="note-body"
            required
            rows={10}
            maxLength={50000}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm"
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving || !title.trim() || !body.trim()}>
            {saving ? 'Saving…' : 'Save note'}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
