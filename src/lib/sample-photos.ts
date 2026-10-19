import seedListings from '../../scripts/fixtures/listing-photos.json'

export function getSamplePhoto(listingId: string): string | undefined {
  return Object.values(seedListings).find(listing => listing.id === listingId)?.photo
}
