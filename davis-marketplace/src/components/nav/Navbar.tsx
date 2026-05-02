import Link from 'next/link'
import { CircleUser } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/button'

export default async function Navbar() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  let avatarUrl: string | undefined
  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', user.id)
      .single()
    avatarUrl = profile?.avatar_url ?? (user.user_metadata.avatar_url as string | undefined)
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
