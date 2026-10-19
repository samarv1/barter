import test from 'node:test'
import assert from 'node:assert/strict'
import { isOwnedObjectKey, validateListingInput } from '../src/lib/validation.ts'

const owner = '11111111-1111-1111-1111-111111111111'
const filename = '22222222-2222-4222-8222-222222222222.jpg'
const key = `listings/${owner}/${filename}`
const valid = { title: 'Desk', description: null, is_free: false, price: 20, category: 'furniture', availability: 'asap', photo_keys: [key] }

test('object ownership rejects cross-user keys, traversal, and wrong purpose', () => {
  assert.equal(isOwnedObjectKey(key, owner, 'listings'), true)
  for (const candidate of [key.replace(owner, 'other'), `listings/${owner}/../${filename}`, `listings/${owner}/${filename}/extra`, key.replace('listings', 'avatars'), null]) {
    assert.equal(isOwnedObjectKey(candidate, owner, 'listings'), false)
  }
})

test('listing input rejects malformed shapes and foreign photos before privileged work', () => {
  assert.equal(validateListingInput(valid, owner), null)
  assert.equal(validateListingInput({ ...valid, is_free: true, price: null }, owner), null)
  for (const input of [null, [], { ...valid, title: ' ' }, { ...valid, price: -1 }, { ...valid, price: Infinity }, { ...valid, is_free: 'false' }, { ...valid, photo_keys: [key.replace(owner, 'other')] }, { ...valid, photo_keys: Array(6).fill(key) }]) {
    assert.equal(typeof validateListingInput(input, owner), 'string')
  }
})
