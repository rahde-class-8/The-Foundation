import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function ReviewsPage() {
  return (
    <>
      <PageHeader
        title="Weak Box"
        description="Due, overdue, and upcoming reviews, weakest concepts first."
      />
      <ComingSoon phase={3} />
    </>
  );
}
