import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Facets } from '../api/schemas';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  domainId: string;
  onDomainChange: (value: string) => void;
  categoryId: string;
  onCategoryChange: (value: string) => void;
  facets: Facets | undefined;
};

const selectClass =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-50';

export function CatalogFilterBar(props: Props) {
  const { query, onQueryChange, domainId, onDomainChange, categoryId, onCategoryChange, facets } =
    props;

  return (
    <div role="search" className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
      <div className="space-y-1.5">
        <Label htmlFor="catalog-search">Search</Label>
        <div className="relative">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-2.5 left-2.5 size-4 text-muted-foreground"
          />
          <Input
            id="catalog-search"
            type="search"
            placeholder="Service, alias, or concept (e.g. elb, visibility timeout)"
            className="pl-8"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="catalog-domain">Exam domain</Label>
        <select
          id="catalog-domain"
          className={selectClass}
          value={domainId}
          onChange={(event) => onDomainChange(event.target.value)}
          disabled={!facets}
        >
          <option value="">All domains</option>
          {facets?.certifications.map((cert) => (
            <optgroup key={cert.id} label={`${cert.code}-${cert.examVersion}`}>
              {cert.domains.map((domain) => (
                <option key={domain.id} value={domain.id}>
                  {domain.code} · {domain.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="catalog-category">Category</Label>
        <select
          id="catalog-category"
          className={selectClass}
          value={categoryId}
          onChange={(event) => onCategoryChange(event.target.value)}
          disabled={!facets}
        >
          <option value="">All categories</option>
          {facets?.categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
