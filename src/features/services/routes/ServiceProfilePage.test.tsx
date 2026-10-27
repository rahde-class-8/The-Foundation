import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as api from '../api/catalog';
import { citation, concept, serviceProfile } from '../test/factories';
import { renderPage } from '../test/render';
import { ServiceProfilePage } from './ServiceProfilePage';

vi.mock('../api/catalog', () => ({
  PAGE_SIZE: 24,
  searchCatalog: vi.fn(),
  getCatalogFacets: vi.fn(),
  getServiceProfile: vi.fn(),
  markConceptExposed: vi.fn(),
}));

const getServiceProfile = vi.mocked(api.getServiceProfile);
const markConceptExposed = vi.mocked(api.markConceptExposed);

beforeEach(() => {
  getServiceProfile.mockResolvedValue(serviceProfile());
  markConceptExposed.mockResolvedValue(undefined);
});

const renderProfile = () => renderPage('/services/lambda', '/services/:id', <ServiceProfilePage />);

describe('ServiceProfilePage', () => {
  it('renders all eight dimensions, marking missing ones (LIB-4a)', async () => {
    renderProfile();

    const profile = await screen.findByRole('region', { name: 'Mastery profile' });
    const terms = within(profile)
      .getAllByRole('term')
      .map((term) => term.textContent);
    expect(terms).toEqual([
      'What it is',
      'How it works',
      'Problem it solves',
      'How it solves it',
      'What it does NOT do',
      'When to choose it',
      'Where it belongs',
      'Trade-offs',
    ]);
    expect(within(profile).getByText('Not yet authored')).toBeInTheDocument();
    expect(getServiceProfile).toHaveBeenCalledWith('lambda');
  });

  it('summarizes concept progress for the service (LIB-7a)', async () => {
    getServiceProfile.mockResolvedValue(
      serviceProfile({
        concepts: [
          concept({
            progress: { masteryStatus: 'reviewing', firstStudiedAt: '2026-10-01T00:00:00Z' },
          }),
          concept({ slug: 'concurrency', title: 'Concurrency' }),
        ],
      }),
    );
    renderProfile();

    expect(
      await screen.findByText('1 of 2 concepts reviewing or better · 1 studied'),
    ).toBeInTheDocument();
  });

  it('expands a concept and records the exposure once (LIB-5, LIB-7)', async () => {
    renderProfile();
    const toggle = await screen.findByRole('button', { name: /Execution limits/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);
    await userEvent.click(toggle);
    await userEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('timeout')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Limitations' })).toBeVisible();
    expect(markConceptExposed).toHaveBeenCalledTimes(1);
    expect(markConceptExposed.mock.calls[0]?.[0]).toBe(
      (await getServiceProfile.mock.results[0]?.value)?.concepts[0]?.id,
    );
  });

  it('labels official citations, paraphrases, and unverified sources (LIB-5a)', async () => {
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /Execution limits/ }));

    const sources = screen.getByRole('heading', { name: 'Sources' }).parentElement as HTMLElement;
    expect(within(sources).getByText('AWS docs')).toBeInTheDocument();
    expect(within(sources).getByText(/Summary of source \(not a quotation\)/)).toBeInTheDocument();
    expect(within(sources).getByText('Not yet checked against the source')).toBeInTheDocument();
    expect(within(sources).getByRole('link', { name: 'Lambda quotas' })).toHaveAttribute(
      'rel',
      'noopener noreferrer',
    );
  });

  it('distinguishes personal notes from AWS documentation (LIB-8a)', async () => {
    getServiceProfile.mockResolvedValue(
      serviceProfile({
        concepts: [
          concept({
            citations: [
              citation({
                excerptKind: 'verbatim',
                excerpt: 'My own note.',
                source: {
                  id: '00000000-0000-4000-8000-0000000000aa',
                  title: 'Study notes',
                  url: null,
                  sourceType: 'user_note',
                  trustTier: 'personal',
                  retrievedAt: null,
                },
              }),
            ],
          }),
        ],
      }),
    );
    renderProfile();
    await userEvent.click(await screen.findByRole('button', { name: /Execution limits/ }));

    const sources = screen.getByRole('heading', { name: 'Sources' }).parentElement as HTMLElement;
    expect(within(sources).getByText('Your notes')).toBeInTheDocument();
    expect(within(sources).queryByText('AWS docs')).toBeNull();
    expect(within(sources).getByText('Not verified against AWS docs')).toBeInTheDocument();
  });

  it('flags content in review and keeps practice disabled until Phase 2', async () => {
    getServiceProfile.mockResolvedValue(serviceProfile({ status: 'in_review' }));
    renderProfile();

    expect(await screen.findByText(/awaiting review against its sources/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Practice this service' })).toBeDisabled();
  });

  it('links related services (LIB-6)', async () => {
    renderProfile();

    const related = await screen.findByRole('region', { name: 'Related services' });
    expect(within(related).getByRole('heading', { name: 'Alternatives' })).toBeInTheDocument();
    expect(within(related).getByRole('link', { name: 'Amazon EC2' })).toHaveAttribute(
      'href',
      '/services/ec2',
    );
  });

  it('shows not found for unknown services (LIB-Xa)', async () => {
    getServiceProfile.mockResolvedValue(null);
    renderProfile();

    expect(await screen.findByRole('heading', { name: 'Service not found' })).toBeInTheDocument();
  });
});
