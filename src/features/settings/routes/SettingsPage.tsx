import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState, type FormEvent } from 'react';
import { CORE_VERSION } from '@core/contracts/health.ts';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getSettings, updateSettings, type Settings } from '../api/settings';

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

function timeZones(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : [];
  return zones.includes(current) ? zones : [current, ...zones];
}

function SettingsForm({ initial }: { initial: Settings }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initial);
  const [status, setStatus] = useState<{ kind: 'saved' | 'error'; message: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const zones = useMemo(() => timeZones(initial.timezone), [initial.timezone]);
  const browserZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const saved = await updateSettings(form);
      queryClient.setQueryData(['settings'], saved);
      setStatus({ kind: 'saved', message: 'Settings saved.' });
    } catch (cause) {
      setStatus({
        kind: 'error',
        message: cause instanceof Error ? cause.message : 'Could not save settings.',
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(event) => void save(event)} className="max-w-lg space-y-6">
      <div className="space-y-1.5">
        <Label htmlFor="timezone">Timezone</Label>
        <select
          id="timezone"
          className={selectClass}
          value={form.timezone}
          onChange={(event) => setForm({ ...form, timezone: event.target.value })}
        >
          {zones.map((zone) => (
            <option key={zone} value={zone}>
              {zone}
            </option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">
          Reviews are due from midnight in this timezone.
          {browserZone && browserZone !== form.timezone ? (
            <>
              {' '}
              <button
                type="button"
                className="underline underline-offset-4"
                onClick={() => setForm({ ...form, timezone: browserZone })}
              >
                Use this device&apos;s timezone ({browserZone})
              </button>
            </>
          ) : null}
        </p>
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Grading</legend>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.aiGradingEnabled}
            onChange={(event) => setForm({ ...form, aiGradingEnabled: event.target.checked })}
          />
          Use AI grading when available
        </label>
        <div className="space-y-1.5">
          <Label htmlFor="eval-mode">After submitting an answer</Label>
          <select
            id="eval-mode"
            className={selectClass}
            value={form.defaultEvalMode}
            onChange={(event) =>
              setForm({
                ...form,
                defaultEvalMode: event.target.value as Settings['defaultEvalMode'],
              })
            }
          >
            <option value="ai_first">Grade with AI first (you can override)</option>
            <option value="self_only">Always grade it myself</option>
          </select>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Daily limits</legend>
        <div className="space-y-1.5">
          <Label htmlFor="new-limit">New concepts per day</Label>
          <Input
            id="new-limit"
            type="number"
            min={0}
            max={100}
            value={form.dailyNewLimit}
            onChange={(event) => setForm({ ...form, dailyNewLimit: Number(event.target.value) })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="review-limit">Reviews per day</Label>
          <Input
            id="review-limit"
            type="number"
            min={1}
            max={1000}
            value={form.dailyReviewLimit}
            onChange={(event) => setForm({ ...form, dailyReviewLimit: Number(event.target.value) })}
          />
        </div>
      </fieldset>

      {status ? (
        <p
          role={status.kind === 'error' ? 'alert' : 'status'}
          className={status.kind === 'error' ? 'text-sm text-destructive' : 'text-sm'}
        >
          {status.message}
        </p>
      ) : null}
      <Button type="submit" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const settings = useQuery({ queryKey: ['settings'], queryFn: getSettings });
  return (
    <>
      <PageHeader title="Settings" description="Timezone, AI grading, and daily limits." />
      <QueryBoundary query={settings} loadingLabel="Loading settings…">
        {(data) => <SettingsForm initial={data} />}
      </QueryBoundary>
      <p className="mt-8 text-xs text-muted-foreground">Learning core v{CORE_VERSION}</p>
    </>
  );
}
