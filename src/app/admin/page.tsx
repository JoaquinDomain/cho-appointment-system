import { notFound } from 'next/navigation'
import AdminApp from '@/components/AdminApp'
import { isAdminSite } from '@/lib/appMode'

export default function AdminPage() {
  if (!isAdminSite) {
    notFound()
  }

  return <AdminApp />
}
