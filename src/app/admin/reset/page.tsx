import AdminReset from '@/components/admin/reset';
import '@/components/admin/admin.css';

export const metadata = { title: 'Reset password — SENTBALE Admin', robots: { index: false } };
export default async function ResetPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <AdminReset token={typeof token === 'string' ? token : ''} />;
}
