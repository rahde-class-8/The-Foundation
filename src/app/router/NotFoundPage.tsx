import { Link } from 'react-router';
import { PageHeader } from '@/components/common/PageHeader';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="That page does not exist." />
      <Link className="text-sm underline underline-offset-4" to="/dashboard">
        Go to the dashboard
      </Link>
    </>
  );
}
