import { render, screen } from '@testing-library/react';
import { safeUrl } from '@/lib/safe-url';
import { Markdown } from './Markdown';

describe('Markdown (CNT-10a)', () => {
  it('renders formatting, lists, and tables', () => {
    render(
      <Markdown>{'**Bold** text\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |'}</Markdown>,
    );

    expect(screen.getByText('Bold').tagName).toBe('STRONG');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('table')).toBeInTheDocument();
  });

  it('drops raw HTML, including scripts and event handlers', () => {
    const { container } = render(
      <Markdown>
        {
          'Hello <script>alert(1)</script> <img src="x" onerror="alert(2)"> <b onclick="x()">bold</b>'
        }
      </Markdown>,
    );

    expect(container.querySelector('script')).toBeNull();
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[onclick]')).toBeNull();
    expect(container.innerHTML).not.toContain('onerror');
  });

  it('opens https links safely and neutralizes unsafe schemes', () => {
    render(
      <Markdown>
        {
          '[docs](https://docs.aws.amazon.com/) [bad](javascript:alert(1)) [plain](http://example.com)'
        }
      </Markdown>,
    );

    const docs = screen.getByRole('link', { name: 'docs' });
    expect(docs).toHaveAttribute('href', 'https://docs.aws.amazon.com/');
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.queryByRole('link', { name: 'bad' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'plain' })).toBeNull();
  });

  it.each([
    ['https://aws.amazon.com', 'https://aws.amazon.com'],
    ['mailto:me@example.com', 'mailto:me@example.com'],
    ['javascript:alert(1)', ''],
    ['data:text/html,hi', ''],
    ['http://example.com', ''],
  ])('safeUrl(%s)', (input, expected) => {
    expect(safeUrl(input)).toBe(expected);
  });
});
