import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ListingForm from '@/components/listings/ListingForm'
import Navbar from '@/components/nav/Navbar'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ShieldX } from 'lucide-react'
import { signOut } from '@/actions/auth'

export default async function NewListingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login?redirectTo=/listings/new')

  const { data: profile } = await supabase
    .from('profiles')
    .select('is_davis_email')
    .eq('id', user.id)
    .single()

  if (!profile?.is_davis_email) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="max-w-lg mx-auto px-4 py-16">
          <Card>
            <CardContent className="pt-6 space-y-4 text-center">
              <ShieldX className="mx-auto h-8 w-8 text-destructive" />
              <h1 className="text-xl font-bold text-destructive">@ucdavis.edu required</h1>
              <form action={signOut}>
                <Button type="submit" variant="outline" className="w-full">
                  Sign out and switch accounts
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-8">Post a listing</h1>
        <ListingForm />
      </div>
    </div>
  )
}
