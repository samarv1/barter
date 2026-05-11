import Link from 'next/link'
import { Bell, Bookmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'
import ProfileMenu from './ProfileMenu'
import NotificationBubble from './NotificationBubble'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let avatarUrl: string | undefined
  let unreadCount = 0

  if (user) {
    const [{ data: profile }, { data: unread }] = await Promise.all([
      supabase.from('profiles').select('avatar_url').eq('id', user.id).single(),
      supabase.from('notifications').select('id').eq('user_id', user.id).eq('read', false).limit(1),
    ])
    avatarUrl = profile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined)
    unreadCount = unread?.length ?? 0
    console.log('[Navbar] user:', user.id, 'unreadCount:', unreadCount, 'raw:', JSON.stringify(unread))
  }

  return (
    <nav className="bg-background border-b px-4 py-3 flex items-center justify-between">
      <Link href="/" className="font-bold text-lg">Barter</Link>
      <div className="flex items-center gap-2">
        {user ? (
          <>
            <Button asChild size="sm">
              <Link href="/listings/new">Post</Link>
            </Button>
            <Button asChild variant="ghost" size="icon">
              <Link href="/saved">
                <Bookmark className="h-5 w-5" />
                <span className="sr-only">Saved</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon" className="relative">
              <Link href="/inbox">
                <Bell className="h-5 w-5" />
                <NotificationBubble initialUnread={unreadCount > 0} userId={user.id} />
                <span className="sr-only">Inbox</span>
              </Link>
            </Button>
            <ProfileMenu avatarUrl={avatarUrl} />
          </>
        ) : (
          <Button asChild size="sm">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        )}
      </div>
    </nav>
  )
}
