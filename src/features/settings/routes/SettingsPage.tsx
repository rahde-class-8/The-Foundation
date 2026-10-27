import { CORE_VERSION } from '@core/contracts/health.ts';
import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function SettingsPage() {
  return (
    <>
      <PageHeader title="Settings" description="Timezone, AI grading, and daily limits." />
      <ComingSoon phase={2} />
      <p className="mt-6 text-xs text-muted-foreground">Learning core v{CORE_VERSION}</p>
    </>
  );
}
