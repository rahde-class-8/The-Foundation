import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function ContentPage() {
  return (
    <>
      <PageHeader
        title="Content"
        description="Sources, imports, and drafts awaiting your review."
      />
      <ComingSoon phase={4} />
    </>
  );
}
