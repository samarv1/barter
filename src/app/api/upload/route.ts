import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generatePresignedPutUrl } from '@/lib/s3'
import { randomUUID } from 'crypto'

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif',
])
const MAX_FILES = 5

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const files: { filename: string; contentType: string }[] = await request.json()
  if (!Array.isArray(files) || files.length === 0) {
    return NextResponse.json({ error: 'No files provided' }, { status: 400 })
  }
  if (files.length > MAX_FILES) {
    return NextResponse.json({ error: `Maximum ${MAX_FILES} files per upload` }, { status: 400 })
  }
  for (const { contentType } of files) {
    if (!ALLOWED_MIME_TYPES.has(contentType)) {
      return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
    }
  }

  const prefix = request.nextUrl.searchParams.get('prefix') ?? 'listings'
  const results = await Promise.all(
    files.map(async ({ filename, contentType }) => {
      const ext = filename.split('.').pop() ?? 'bin'
      const key = `${prefix}/${user.id}/${randomUUID()}.${ext}`
      const url = await generatePresignedPutUrl(key, contentType)
      return { url, key }
    })
  )

  return NextResponse.json(results)
}
