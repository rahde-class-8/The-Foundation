import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryBoundary } from '@/components/common/QueryBoundary';
import { getDashboard } from '../api/dashboard';
import {
  AccuracyPanel,
  ActivityPanel,
  DomainsPanel,
  MasteryPanel,
  ReadinessPanel,
  StatTiles,
  WeakestPanel,
} from '../components/Widgets';

export function DashboardPage() {
  const query = useQuery({ queryKey: ['dashboard'], queryFn: () => getDashboard() });
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Due reviews, cold-recall accuracy, and coverage at a glance."
      />
      <QueryBoundary query={query} loadingLabel="Loading your progress…">
        {(data) => (
          <div className="space-y-4">
            <StatTiles counts={data.counts} windowDays={data.windowDays} />
            <div className="grid gap-4 lg:grid-cols-2">
              <AccuracyPanel data={data} />
              <ReadinessPanel readiness={data.readiness} />
              <MasteryPanel distribution={data.masteryDistribution} />
              <WeakestPanel weakest={data.weakest} />
              <DomainsPanel data={data} />
              <ActivityPanel data={data} />
            </div>
          </div>
        )}
      </QueryBoundary>
    </>
  );
}
