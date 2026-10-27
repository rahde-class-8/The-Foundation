import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryBoundary } from './QueryBoundary';

function Harness({ fetcher }: { fetcher: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ['items'], queryFn: fetcher });
  return (
    <QueryBoundary query={query} isEmpty={(items) => items.length === 0} empty={<p>No items</p>}>
      {(items) => (
        <ul>
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      )}
    </QueryBoundary>
  );
}

function renderWithClient(fetcher: () => Promise<string[]>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Harness fetcher={fetcher} />
    </QueryClientProvider>,
  );
}

describe('QueryBoundary', () => {
  it('shows a loading status, then the data', async () => {
    renderWithClient(() => Promise.resolve(['Lambda']));

    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    expect(await screen.findByText('Lambda')).toBeInTheDocument();
  });

  it('shows the empty state', async () => {
    renderWithClient(() => Promise.resolve([]));

    expect(await screen.findByText('No items')).toBeInTheDocument();
  });

  it('shows an error with a working retry', async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(['S3']);
    renderWithClient(fetcher);

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('S3')).toBeInTheDocument();
  });
});
