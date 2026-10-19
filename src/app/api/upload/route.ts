import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePresignedPutUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'
import { IMAGE_EXTENSIONS } from '@/lib/validation'

const MAX_FILES = 5

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let files: unknown
  try {
    files = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files per upload` }, { status: 400 })
  }
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.contentType !== 'string' || !Object.hasOwn(IMAGE_EXTENSIONS, file.contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }
  }

  const prefix = request.nextUrl.searchParams.get('prefix') ?? 'listings'
  if (prefix !== 'listings' && prefix !== 'avatars') {
    return NextResponse.json({ error: 'Invalid upload destination' }, { status: 400 })
  }
  const results = await Promise.all(
    files.map(async ({ contentType }) => {
      const ext = IMAGE_EXTENSIONS[contentType]
      const key = `${prefix}/${user.id}/${randomUUID()}.${ext}`
      const url = await generatePresignedPutUrl(key, contentType)
      return { url, key }
    })
  )

  return NextResponse.json(results)
}
