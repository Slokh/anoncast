import { NextRequest, NextResponse } from 'next/server'

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const apiKey = process.env.UPLOAD_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'Upload service not configured' }, { status: 500 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Allowed: JPEG, PNG, GIF, WebP' },
        { status: 400 }
      )
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'File too large. Max size: 10MB' }, { status: 400 })
    }

    // Forward to uno.fun upload API
    const uploadFormData = new FormData()
    uploadFormData.append('image', file)

    const response = await fetch('https://api.uno.fun/v1/uploads', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
        Accept: 'application/json',
      },
      body: uploadFormData,
    })

    if (!response.ok) {
      return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
    }

    const result = await response.json()
    const imageUrl = result.data?.link

    if (!imageUrl) {
      return NextResponse.json({ error: 'No image URL returned' }, { status: 500 })
    }

    return NextResponse.json({ url: imageUrl })
  } catch {
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
