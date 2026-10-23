import Dashboard from '@/components/admin/dashboard';
import { currentAdmin } from '@/lib/admin-auth';
export default async function AdminPage() { return <Dashboard name={(await currentAdmin())?.name || ''} />; }
