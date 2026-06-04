import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import Navbar from '@/components/nav/Navbar'
import ListingEditForm from '@/components/listings/ListingEditForm'

export default async function EditListingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect(`/auth/login?redirectTo=/listings/${id}/edit`)

  const { data: listing } = await supabase
    .from('listings')
    .select('id, seller_id, status, title, description, price, is_free, category, availability, photo_keys')
    .eq('id', id)
    .single()

  if (!listing) notFound()
  if (listing.seller_id !== user.id) notFound()
  if (listing.status !== 'active') redirect(`/listings/${id}`)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 py-10">
        <Link href={`/listings/${id}`} className="text-sm text-muted-foreground hover:text-foreground mb-6 inline-block">
          ← Back to listing
        </Link>
        <h1 className="text-2xl font-bold mb-8">Edit listing</h1>
        <ListingEditForm
          listingId={id}
          initial={{
            title: listing.title,
            description: listing.description,
            price: listing.price !== null ? Number(listing.price) : null,
            is_free: listing.is_free,
            category: listing.category,
            availability: listing.availability,
            photo_keys: listing.photo_keys ?? [],
          }}
        />
      </div>
    </div>
  )
}
