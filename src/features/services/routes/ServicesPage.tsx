import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function ServicesPage() {
  return (
    <>
      <PageHeader
        title="Service library"
        description="Browse AWS services and their independently testable concepts."
      />
      <ComingSoon phase={1} />
    </>
  );
}
