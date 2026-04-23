import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ListingForm from '@/components/listings/ListingForm'

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
      <div className="max-w-lg mx-auto px-4 py-16 text-center space-y-3">
        <h1 className="text-xl font-bold text-gray-900">@ucdavis.edu required</h1>
        <p className="text-sm text-gray-600">
          Only accounts with a verified @ucdavis.edu email can post listings.
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-lg mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold text-gray-900 mb-8">Post a listing</h1>
      <ListingForm />
    </div>
  )
}
