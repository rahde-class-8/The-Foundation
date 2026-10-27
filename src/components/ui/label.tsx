import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

function Label({ className, ...props }: ComponentProps<'label'>) {
  return (
    // eslint-disable-next-line jsx-a11y/label-has-associated-control -- callers supply htmlFor
    <label
      data-slot="label"
      className={cn(
        'flex items-center gap-2 text-sm font-medium leading-none select-none',
        className,
      )}
      {...props}
    />
  );
}

export { Label };
