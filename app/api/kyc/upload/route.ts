import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, createAdminClient } from '@/lib/supabase/server'
import { rateLimit, getClientIp } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  if (!rateLimit(getClientIp(req), 'kyc_upload', 3, 60_000)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
  }
  const supabase = await createServerClient()

  // 1. Verificar auth
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parsear multipart/form-data
  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const docFront  = formData.get('docFront')  as File | null
  const docBack   = formData.get('docBack')   as File | null
  const selfie    = formData.get('selfie')    as File | null
  const applicationId = formData.get('applicationId') as string | null

  if (!docFront || !docBack || !selfie || !applicationId) {
    return NextResponse.json({ error: 'Missing required fields: docFront, docBack, selfie, applicationId' }, { status: 400 })
  }

  // Validate MIME types and file sizes (max 5 MB each)
  const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
  const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5 MB
  for (const [field, file] of [['docFront', docFront], ['docBack', docBack], ['selfie', selfie]] as [string, File][]) {
    if (!ALLOWED_MIME.includes(file.type)) {
      return NextResponse.json({ error: `Invalid file type for ${field}: ${file.type}. Allowed: jpeg, png, webp, pdf` }, { status: 400 })
    }
    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json({ error: `File ${field} exceeds 5 MB limit` }, { status: 400 })
    }
  }

  // 3. Verificar que o usuário é dono da aplicação
  const { data: application, error: appError } = await supabase
    .from('applications')
    .select('id, user_id')
    .eq('id', applicationId)
    .single()

  if (appError || !application) {
    return NextResponse.json({ error: 'Application not found' }, { status: 404 })
  }

  const app = application as { id: string; user_id: string }
  if (app.user_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // 4. Upload dos arquivos para Supabase Storage
  async function uploadFile(file: File, bucket: string, path: string) {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = new Uint8Array(arrayBuffer)
    const { error } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type || 'image/jpeg',
      upsert: true,
    })
    if (error) throw new Error(`Upload failed for ${path}: ${error.message}`)
  }

  try {
    await Promise.all([
      uploadFile(docFront,  'documents', `${applicationId}/doc_front.jpg`),
      uploadFile(docBack,   'documents', `${applicationId}/doc_back.jpg`),
      uploadFile(selfie,    'selfies',   `${applicationId}/selfie.jpg`),
    ])
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload error'
    return NextResponse.json({ error: message }, { status: 500 })
  }

  // 5. Gerar signed URLs (1h)
  const expiresIn = 3600
  const [docFrontSigned, docBackSigned, selfieSigned] = await Promise.all([
    admin.storage.from('documents').createSignedUrl(`${applicationId}/doc_front.jpg`, expiresIn),
    admin.storage.from('documents').createSignedUrl(`${applicationId}/doc_back.jpg`,  expiresIn),
    admin.storage.from('selfies').createSignedUrl(`${applicationId}/selfie.jpg`,      expiresIn),
  ])

  const docFrontUrl = docFrontSigned.data?.signedUrl ?? ''
  const docBackUrl  = docBackSigned.data?.signedUrl  ?? ''
  const selfieUrl   = selfieSigned.data?.signedUrl   ?? ''

  // 6. Chamar análise KYC
  let kycResult = null
  try {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
    const kycRes = await fetch(`${appUrl}/api/ai/kyc/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ applicationId, docFrontUrl, docBackUrl, selfieUrl }),
    })
    if (kycRes.ok) {
      kycResult = await kycRes.json()
    }
  } catch {
    // KYC analysis failure is non-blocking
  }

  return NextResponse.json({
    success: true,
    docFrontUrl,
    docBackUrl,
    selfieUrl,
    kycResult,
  })
}
