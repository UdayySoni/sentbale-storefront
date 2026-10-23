import AcceptInvite from '@/components/admin/invite';
import { inviteDetails } from '@/lib/admin-auth';
import '@/components/admin/admin.css';

export const metadata = { title: 'Join the team — SENTBALE Admin', robots: { index: false } };
export const dynamic = 'force-dynamic';
export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  const value = typeof token === 'string' ? token : '';
  return <AcceptInvite token={value} invite={await inviteDetails(value)} />;
}
