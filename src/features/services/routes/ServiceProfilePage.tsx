import { useParams } from 'react-router';
import { ComingSoon } from '@/components/common/ComingSoon';
import { PageHeader } from '@/components/common/PageHeader';

export function ServiceProfilePage() {
  const { id } = useParams();
  return (
    <>
      <PageHeader title="Service mastery profile" description={`Service: ${id ?? 'unknown'}`} />
      <ComingSoon phase={1} />
    </>
  );
}
