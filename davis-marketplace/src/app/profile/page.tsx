import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProfileForm from './ProfileForm'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, email, is_davis_email')
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-lg mx-auto px-4 py-10 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Your profile</h1>
        <p className="mt-1 text-sm text-gray-500">{profile?.email}</p>
        {profile?.is_davis_email && (
          <span className="inline-block mt-2 text-xs font-medium bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
            Verified @ucdavis.edu — can post listings
          </span>
        )}
      </div>

      <ProfileForm
        defaultDisplayName={profile?.display_name ?? ''}
        defaultPhone={profile?.phone ?? ''}
      />
    </div>
  )
}
