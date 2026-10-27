export function ComingSoon({ phase }: { phase: number }) {
  return (
    <p className="rounded-md border border-dashed p-6 text-sm text-muted-foreground">
      This screen is built in Phase {phase}.
    </p>
  );
}
