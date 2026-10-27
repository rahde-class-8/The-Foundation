import { useState } from 'react';
import { useNavigate } from 'react-router';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { startSession, type ScopeType } from '../api/practice';
import type { Scopes } from '../api/schemas';
import { useScopes } from '../hooks/usePractice';

const selectClass = 'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm';

function Picker({ scopes }: { scopes: Scopes }) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<ScopeType>(scopes.dueCount > 0 ? 'due_reviews' : 'mixed');
  const [serviceId, setServiceId] = useState(scopes.services[0]?.id ?? '');
  const [domainId, setDomainId] = useState(scopes.domains[0]?.id ?? '');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  async function start() {
    setStarting(true);
    setError(null);
    try {
      const session = await startSession(
        scope,
        scope === 'service' ? serviceId : scope === 'domain' ? domainId : undefined,
      );
      void navigate(`/practice?session=${session.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start a session.');
      setStarting(false);
    }
  }

  if (scopes.totalQuestions === 0) {
    return (
      <div className="space-y-2 rounded-md border border-dashed p-6 text-sm">
        <p className="font-medium">No published questions yet.</p>
        <p className="text-muted-foreground">
          Practice only uses reviewed, published content. The seed catalog is still in review:
          verify concepts against their AWS sources and publish them (see
          content/catalog/README.md), then run npm run catalog:import.
        </p>
      </div>
    );
  }

  const options: { value: ScopeType; label: string; detail: string; disabled?: boolean }[] = [
    {
      value: 'due_reviews',
      label: 'Due reviews',
      detail: `${scopes.dueCount} due today`,
      disabled: scopes.dueCount === 0,
    },
    {
      value: 'weak',
      label: 'Weakest concepts',
      detail: `${scopes.weakCount} to strengthen`,
      disabled: scopes.weakCount === 0,
    },
    { value: 'mixed', label: 'Mixed', detail: 'Due, weak, then new concepts' },
    {
      value: 'service',
      label: 'One service',
      detail: `${scopes.services.length} available`,
      disabled: scopes.services.length === 0,
    },
    {
      value: 'domain',
      label: 'One exam domain',
      detail: `${scopes.domains.length} available`,
      disabled: scopes.domains.length === 0,
    },
  ];

  return (
    <div className="space-y-5">
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">What do you want to practice?</legend>
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-3 rounded-md border p-3 text-sm has-[:checked]:border-ring has-[:disabled]:opacity-50"
          >
            <input
              type="radio"
              name="scope"
              value={option.value}
              checked={scope === option.value}
              disabled={option.disabled}
              onChange={() => setScope(option.value)}
            />
            <span className="font-medium">{option.label}</span>
            <span className="text-muted-foreground">{option.detail}</span>
          </label>
        ))}
      </fieldset>
      {scope === 'service' ? (
        <div className="space-y-1.5">
          <Label htmlFor="practice-service">Service</Label>
          <select
            id="practice-service"
            className={selectClass}
            value={serviceId}
            onChange={(e) => setServiceId(e.target.value)}
          >
            {scopes.services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.questionCount})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {scope === 'domain' ? (
        <div className="space-y-1.5">
          <Label htmlFor="practice-domain">Exam domain</Label>
          <select
            id="practice-domain"
            className={selectClass}
            value={domainId}
            onChange={(e) => setDomainId(e.target.value)}
          >
            {scopes.domains.map((d) => (
              <option key={d.id} value={d.id}>
                {d.certification} {d.code} · {d.name} ({d.questionCount})
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button onClick={() => void start()} disabled={starting}>
        {starting ? 'Starting…' : 'Start session'}
      </Button>
    </div>
  );
}

export function ScopePicker() {
  const scopes = useScopes();
  return (
    <QueryBoundary query={scopes} loadingLabel="Loading practice options…">
      {(data) => <Picker scopes={data} />}
    </QueryBoundary>
  );
}
