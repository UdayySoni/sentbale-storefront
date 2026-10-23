import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import AdminShell from '@/components/admin/shell';
import { currentAdmin } from '@/lib/admin-auth';
import '@/components/admin/admin.css';

export const metadata: Metadata = { title: { default: 'Dashboard — SENTBALE Admin', template: '%s — SENTBALE Admin' } };

// The proxy only checks that a session cookie exists; this is where the session is actually verified.
export default async function AdminLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const admin = await currentAdmin();
  if (!admin) redirect('/admin/login');
  return <AdminShell admin={{ name: admin.name, email: admin.email, role: admin.role }}>{children}</AdminShell>;
}
