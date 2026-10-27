import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { safeUrl } from '@/lib/safe-url';
import { cn } from '@/lib/utils';

// SECURITY §8: no raw HTML (skipHtml), and links limited to https: and mailto: (safeUrl).

const components: Components = {
  p: ({ node: _node, ...props }) => <p className="leading-relaxed" {...props} />,
  ul: ({ node: _node, ...props }) => <ul className="list-disc space-y-1 pl-5" {...props} />,
  ol: ({ node: _node, ...props }) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
  a: ({ node: _node, href, children, ...props }) =>
    href ? (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-4 hover:text-foreground"
        {...props}
      >
        {children}
      </a>
    ) : (
      <span>{children}</span>
    ),
  code: ({ node: _node, ...props }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" {...props} />
  ),
  table: ({ node: _node, ...props }) => (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm" {...props} />
    </div>
  ),
  th: ({ node: _node, ...props }) => <th className="border-b px-2 py-1.5 font-medium" {...props} />,
  td: ({ node: _node, ...props }) => <td className="border-b px-2 py-1.5 align-top" {...props} />,
};

export function Markdown({ children, className }: { children: string; className?: string }) {
  return (
    <div className={cn('space-y-3 text-sm', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        skipHtml
        urlTransform={safeUrl}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}
