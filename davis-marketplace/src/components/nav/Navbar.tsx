import Link from 'next/link'
import { Bell, CircleUser } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let avatarUrl: string | undefined
  let unreadCount = 0

  if (user) {
    const [{ data: profile }, { count }] = await Promise.all([
      supabase.from('profiles').select('avatar_url').eq('id', user.id).single(),
      supabase.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('read', false),
    ])
    avatarUrl = profile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined)
    unreadCount = count ?? 0
  }

  return (
    <nav className="bg-background border-b px-4 py-3 flex items-center justify-between">
      <Link href="/" className="font-bold text-lg">Davis Marketplace</Link>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Button asChild size="sm">
              <Link href="/listings/new">Post listing</Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/inbox">
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-destructive" />
                )}
                <span className="sr-only">Inbox</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link href="/profile">
                {avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarUrl}
                    alt="Profile"
                    className="h-7 w-7 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <CircleUser className="h-5 w-5" />
                )}
                <span className="sr-only">Profile</span>
              </Link>
            </Button>
          </>
        ) : (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href="/auth/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/auth/signup">Sign up</Link>
            </Button>
          </>
        )}
      </div>
    </nav>
  )
}
