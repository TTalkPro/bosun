import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import MarkdownView from '@/components/markdown/MarkdownView';
import { renderApp } from './render';

vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async () => ({ svg: '<svg data-testid="mermaid-svg"></svg>' })) } }));

const md = `# 标题

| a | b |
|---|---|
| 1 | 2 |

- [x] done
- [ ] todo

\`\`\`mermaid
flowchart LR
  A --> B
\`\`\`

<script>alert(1)</script>

[task](/tasks/BOS-1) and [ext](https://example.com)
`;

describe('MarkdownView', () => {
  it('renders GFM, mermaid and keeps raw HTML inert', async () => {
    const { container } = renderApp(<MarkdownView markdown={md} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('标题');
    expect(container.querySelector('table')).not.toBeNull();
    const boxes = container.querySelectorAll('input[type=checkbox]');
    expect(boxes).toHaveLength(2);
    expect((boxes[0] as HTMLInputElement).checked).toBe(true);
    expect((boxes[0] as HTMLInputElement).disabled).toBe(true);
    expect(container.querySelector('script')).toBeNull();
    expect(container.textContent).toContain('<script>alert(1)</script>');
    expect(await screen.findByTestId('mermaid-svg')).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/tasks/BOS-1');
    expect(links[1]).toHaveAttribute('target', '_blank');
  });

  it('shows placeholder for empty content', () => {
    renderApp(<MarkdownView markdown="  " empty="nothing" />);
    expect(screen.getByText('nothing')).toBeInTheDocument();
  });
});
