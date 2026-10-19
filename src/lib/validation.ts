const CATEGORIES = new Set(['furniture', 'electronics', 'clothing', 'books', 'appliances', 'bikes', 'sports', 'other'])
const AVAILABILITY = new Set(['asap', 'beginning_of_summer', 'end_of_summer'])
export const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = Object.freeze({
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/gif': 'gif', 'image/heic': 'heic', 'image/heif': 'heif',
})

export function isOwnedObjectKey(key: unknown, userId: string, prefix: 'listings' | 'avatars'): key is string {
  if (typeof key !== 'string') return false
  const ownerPrefix = `${prefix}/${userId}/`
  return key.startsWith(ownerPrefix) && /^[a-f0-9-]{36}\.(?:jpe?g|png|webp|gif|heic|heif)$/i.test(key.slice(ownerPrefix.length))
}

export function validateListingInput(input: unknown, userId: string): string | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'Invalid listing'
  const fields = input as Record<string, unknown>
  if (typeof fields.title !== 'string' || !fields.title.trim() || fields.title.length > 200) return 'Title must be between 1 and 200 characters'
  if (fields.description != null && (typeof fields.description !== 'string' || fields.description.length > 10000)) return 'Description must be at most 10000 characters'
  if (typeof fields.is_free !== 'boolean') return 'Invalid free listing flag'
  if (!fields.is_free && (typeof fields.price !== 'number' || !Number.isFinite(fields.price) || fields.price <= 0 || fields.price > 99999999.99)) return 'Enter a valid positive price'
  if (typeof fields.category !== 'string' || !CATEGORIES.has(fields.category)) return 'Invalid category'
  if (typeof fields.availability !== 'string' || !AVAILABILITY.has(fields.availability)) return 'Invalid availability'
  if (!Array.isArray(fields.photo_keys) || fields.photo_keys.length < 1 || fields.photo_keys.length > 5 || !fields.photo_keys.every(key => isOwnedObjectKey(key, userId, 'listings'))) return 'Include 1 to 5 photos uploaded by your account'
  return null
}
