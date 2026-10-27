import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Due reviews, cold-recall accuracy, and coverage at a glance."
      />
      <ComingSoon phase={3} />
    </>
  );
}
