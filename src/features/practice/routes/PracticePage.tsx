import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function PracticePage() {
  return (
    <>
      <PageHeader
        title="Practice"
        description="Answer open-ended questions from memory, then correct what you missed."
      />
      <ComingSoon phase={2} />
    </>
  );
}
