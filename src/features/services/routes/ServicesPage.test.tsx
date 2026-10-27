import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../api/catalog';
import { facets, searchPage, serviceCard } from '../test/factories';
import { renderPage } from '../test/render';
import { ServicesPage } from './ServicesPage';

vi.mock('../api/catalog', () => ({
  PAGE_SIZE: 24,
  searchCatalog: vi.fn(),
  getCatalogFacets: vi.fn(),
  getServiceProfile: vi.fn(),
  markConceptExposed: vi.fn(),
}));

const searchCatalog = vi.mocked(api.searchCatalog);
const compute = { id: '00000000-0000-4000-8000-0000000000c1', slug: 'compute', name: 'Compute' };
const database = { id: '00000000-0000-4000-8000-0000000000c2', slug: 'database', name: 'Database' };

beforeEach(() => {
  vi.mocked(api.getCatalogFacets).mockResolvedValue(facets());
  searchCatalog.mockResolvedValue(
    searchPage([
      serviceCard({ slug: 'lambda', name: 'AWS Lambda', category: compute }),
      serviceCard({ slug: 'ec2', name: 'Amazon EC2', category: compute, status: 'in_review' }),
      serviceCard({
        slug: 'dynamodb',
        name: 'Amazon DynamoDB',
        category: database,
        conceptCount: 5,
      }),
    ]),
  );
});

const renderServices = (path = '/services') => renderPage(path, '/services', <ServicesPage />);

describe('ServicesPage', () => {
  it('groups services by category with linked cards (LIB-1a)', async () => {
    renderServices();

    const computeSection = await screen.findByRole('region', { name: 'Compute' });
    expect(
      within(computeSection)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/services/lambda', '/services/ec2']);
    expect(screen.getByRole('region', { name: 'Database' })).toBeInTheDocument();
  });

  it('shows per-service concept progress, never a single mastered flag (LIB-7a)', async () => {
    renderServices();

    const lambda = await screen.findByRole('link', { name: /AWS Lambda/ });
    expect(lambda).toHaveTextContent('2 of 6 concepts reviewing or better · 3 studied');
  });

  it('flags services that are still in review', async () => {
    renderServices();

    const ec2 = await screen.findByRole('link', { name: /Amazon EC2/ });
    expect(within(ec2).getByText('In review')).toBeInTheDocument();
  });

  it('searches after typing pauses and keeps the query in the URL (LIB-3a)', async () => {
    const router = renderServices();
    await screen.findByRole('region', { name: 'Compute' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search' }), 'elb');

    await waitFor(() => expect(searchCatalog).toHaveBeenLastCalledWith({ q: 'elb' }, undefined));
    expect(router.state.location.search).toBe('?q=elb');
  });

  it('filters by exam domain (LIB-2a)', async () => {
    renderServices();
    const domain = await screen.findByRole('combobox', { name: 'Exam domain' });
    await waitFor(() => expect(domain).toBeEnabled());

    await userEvent.selectOptions(domain, 'D2 · Design Resilient Architectures');

    await waitFor(() =>
      expect(searchCatalog).toHaveBeenLastCalledWith(
        { domainId: '00000000-0000-4000-8000-0000000000d2' },
        undefined,
      ),
    );
  });

  it('shows matching concepts for concept searches', async () => {
    searchCatalog.mockResolvedValue(
      searchPage([
        serviceCard({
          matchedConcepts: [
            {
              id: '00000000-0000-4000-8000-0000000000f1',
              slug: 'concurrency',
              title: 'Concurrency',
            },
          ],
        }),
      ]),
    );
    renderServices('/services?q=lambda+concurrency');

    const matches = await screen.findByLabelText('Matching concepts');
    expect(matches).toHaveTextContent('Concurrency');
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('lambda concurrency');
  });

  it('offers to clear filters when nothing matches', async () => {
    searchCatalog.mockResolvedValue(searchPage([]));
    const router = renderServices('/services?q=zzz');

    await userEvent.click(await screen.findByRole('button', { name: 'Clear filters' }));

    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue('');
    expect(router.state.location.search).toBe('');
  });

  it('loads the next page with the cursor', async () => {
    searchCatalog
      .mockResolvedValueOnce(
        searchPage([serviceCard({ slug: 'lambda', name: 'AWS Lambda' })], 'cursor-1'),
      )
      .mockResolvedValueOnce(searchPage([serviceCard({ slug: 'ec2', name: 'Amazon EC2' })]));
    renderServices();

    await userEvent.click(await screen.findByRole('button', { name: 'Load more' }));

    expect(await screen.findByRole('link', { name: /Amazon EC2/ })).toBeInTheDocument();
    expect(searchCatalog).toHaveBeenLastCalledWith({}, 'cursor-1');
    expect(screen.queryByRole('button', { name: 'Load more' })).toBeNull();
  });

  it('shows an error with retry', async () => {
    searchCatalog.mockRejectedValueOnce(new Error('network down'));
    renderServices();

    expect(await screen.findByRole('alert')).toHaveTextContent('network down');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await screen.findByRole('region', { name: 'Compute' })).toBeInTheDocument();
  });
});
