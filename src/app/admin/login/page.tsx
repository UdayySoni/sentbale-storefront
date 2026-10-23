import { redirect } from 'next/navigation';
import AdminLogin from '@/components/admin/login';
import { adminCount, currentAdmin } from '@/lib/admin-auth';
import { setupCodeRequired } from '@/lib/config';
import '@/components/admin/admin.css';

export const metadata = { title: 'Sign in — SENTBALE Admin' };
export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  if (await currentAdmin()) redirect('/admin');
  const { next } = await searchParams;
  // Only ever return to a page inside the admin panel.
  const target = typeof next === 'string' && /^\/admin(\/[a-z]+)?$/.test(next) ? next : '/admin';
  return <AdminLogin setup={(await adminCount()) === 0} needsCode={setupCodeRequired()} next={target} />;
}
