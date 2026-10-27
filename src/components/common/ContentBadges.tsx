import { Badge } from '@/components/ui/badge';

export type ContentStatus = 'draft' | 'in_review' | 'published' | 'retired';
export type TrustTier = 'official' | 'curated' | 'personal';

/** Shown for anything not yet approved for practice (CONTENT_GOVERNANCE §3). */
export function ReviewStatusBadge({ status }: { status: ContentStatus }) {
  if (status === 'published') return null;
  const label = status === 'in_review' ? 'In review' : status === 'draft' ? 'Draft' : 'Retired';
  return (
    <Badge variant="warning" title="Not yet approved for practice">
      {label}
    </Badge>
  );
}

const TRUST_LABELS: Record<TrustTier, string> = {
  official: 'AWS docs',
  curated: 'Curated',
  personal: 'Your notes',
};

/** Source trust tier (CONTENT_GOVERNANCE §2). Personal notes never carry AWS branding (LIB-8a). */
export function TrustBadge({ tier }: { tier: TrustTier }) {
  return (
    <Badge variant={tier === 'official' ? 'info' : tier === 'curated' ? 'secondary' : 'outline'}>
      {TRUST_LABELS[tier]}
    </Badge>
  );
}

export function VerificationNote({
  tier,
  retrievedAt,
}: {
  tier: TrustTier;
  retrievedAt: string | null;
}) {
  if (tier === 'personal') {
    return <span className="text-xs text-muted-foreground">Not verified against AWS docs</span>;
  }
  if (!retrievedAt) {
    return (
      <span className="text-xs text-amber-700 dark:text-amber-300">
        Not yet checked against the source
      </span>
    );
  }
  return (
    <span className="text-xs text-muted-foreground">
      Checked <time dateTime={retrievedAt}>{retrievedAt.slice(0, 10)}</time>
    </span>
  );
}
