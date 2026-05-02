import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { signOut } from '@/actions/auth'
import AvatarUploader from './AvatarUploader'
import ProfileForm from './ProfileForm'
import Navbar from '@/components/nav/Navbar'

export default async function ProfilePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, phone, email, is_davis_email, avatar_url')
    .eq('id', user.id)
    .single()

  const avatarUrl = profile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined)
  const defaultDisplayName = profile?.display_name ?? (user.user_metadata.full_name as string | undefined) ?? ''

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 py-10 space-y-8">

        {/* Profile header */}
        <div className="flex items-center gap-6">
          <AvatarUploader avatarUrl={avatarUrl} />

          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold truncate">
              {defaultDisplayName || 'Your profile'}
            </h1>
            {profile?.email && (
              <p className="mt-1 text-sm text-muted-foreground">{profile.email}</p>
            )}
            <div className="mt-0.5 flex items-center gap-1.5">
              {profile?.is_davis_email ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              <span className={`text-xs ${profile?.is_davis_email ? 'text-green-600' : 'text-muted-foreground'}`}>
                {profile?.is_davis_email
                  ? 'Permitted to post listings'
                  : 'Only @ucdavis.edu accounts can post listings'}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <Button asChild variant="outline" size="sm">
              <Link href="/my-listings">My listings</Link>
            </Button>
            <form action={signOut}>
              <Button type="submit" variant="ghost" size="sm" className="w-full">Sign out</Button>
            </form>
          </div>
        </div>

        <hr />

        {/* Edit form */}
        <ProfileForm
          defaultDisplayName={defaultDisplayName}
          defaultPhone={profile?.phone ?? ''}
        />
      </div>
    </div>
  )
}
