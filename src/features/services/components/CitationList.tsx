import { TrustBadge, VerificationNote } from '@/components/common/ContentBadges';
import type { Citation } from '../api/schemas';

export function CitationList({ citations }: { citations: Citation[] }) {
  return (
    <ul className="space-y-3">
      {citations.map((citation) => (
        <li
          key={`${citation.passageId}-${citation.supportType}`}
          className="space-y-1.5 rounded-md bg-muted/50 p-3"
        >
          <div className="flex flex-wrap items-center gap-2">
            <TrustBadge tier={citation.source.trustTier} />
            {citation.source.url ? (
              <a
                href={citation.source.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline underline-offset-4"
              >
                {citation.source.title}
              </a>
            ) : (
              <span className="text-sm">{citation.source.title}</span>
            )}
            <VerificationNote
              tier={citation.source.trustTier}
              retrievedAt={citation.source.retrievedAt}
            />
          </div>
          {citation.sectionPath ? (
            <p className="text-xs text-muted-foreground">Section: {citation.sectionPath}</p>
          ) : null}
          {citation.excerptKind === 'verbatim' ? (
            <blockquote className="border-l-2 pl-3 text-sm italic">“{citation.excerpt}”</blockquote>
          ) : (
            <p className="text-sm">
              <span className="text-xs font-medium text-muted-foreground">
                Summary of source (not a quotation):{' '}
              </span>
              {citation.excerpt}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
