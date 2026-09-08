import { useEffect, useState, type ChangeEvent } from 'react'
import { PERSONA_ACTIVITY_TAGS, PERSONA_MOOD_TAGS } from '../lib/personaTags'
import { supabase } from '../supabaseClient'

interface PoolImage {
  id: string
  tags: string[]
  image_url: string
  created_at: string
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

// 캐릭터 이미지 풀(persona_image_pool)에 이미지를 웹에서 바로 올리는 관리자 페이지.
// /imageadd로 접근하며, 구글 로그인만 하면 일단 이 화면까지는 오지만(App.tsx), 실제로
// 허용된 계정인지는 api/admin-persona-image.ts가 ADMIN_EMAIL로 서버에서 검증한다.
// 그 확인이 끝나기 전엔 업로드/삭제 UI를 보여주지 않는다.
export function ImageAddAdmin() {
  const [authorized, setAuthorized] = useState<boolean | null>(null)
  const [images, setImages] = useState<PoolImage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [selectedMood, setSelectedMood] = useState<string | null>(null)
  const [selectedActivities, setSelectedActivities] = useState<string[]>([])
  const [freeTags, setFreeTags] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const checkAuthorized = async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session) {
      setAuthorized(false)
      return
    }
    const res = await fetch('/api/admin-persona-image', {
      method: 'GET',
      headers: { authorization: `Bearer ${session.access_token}` },
    })
    setAuthorized(res.ok)
  }

  const loadImages = async () => {
    const { data } = await supabase
      .from('persona_image_pool')
      .select('*')
      .order('created_at', { ascending: false })
    setImages((data as PoolImage[] | null) ?? [])
    setLoadingList(false)
  }

  useEffect(() => {
    checkAuthorized()
    loadImages()
  }, [])

  const toggleActivity = (tag: string) => {
    setSelectedActivities((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]))
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    setFiles(Array.from(e.target.files ?? []))
  }

  const handleUpload = async () => {
    const tags = [
      ...(selectedMood ? [selectedMood] : []),
      ...selectedActivities,
      ...freeTags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
    ]
    if (tags.length === 0 || files.length === 0) {
      setMessage('태그와 이미지 파일을 모두 선택해주세요.')
      return
    }

    setUploading(true)
    setMessage(null)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) throw new Error('로그인이 필요해요.')

      let succeeded = 0
      for (const file of files) {
        const imageBase64 = await fileToBase64(file)
        const res = await fetch('/api/admin-persona-image', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ imageBase64, mimeType: file.type, tags }),
        })
        if (res.ok) succeeded++
      }
      setMessage(`${succeeded}/${files.length}장 업로드 완료`)
      setFiles([])
      await loadImages()
    } catch (err) {
      setMessage('업로드 중 문제가 생겼어요.')
      console.error(err)
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (!session) return

      await fetch('/api/admin-persona-image', {
        method: 'DELETE',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ imageId: id }),
      })
      await loadImages()
    } finally {
      setDeletingId(null)
    }
  }

  if (authorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-amber-200 border-t-amber-500" />
      </div>
    )
  }

  if (authorized === false) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-amber-50 px-4 text-center">
        <p className="text-sm text-stone-600">이 계정은 관리자 권한이 없어요.</p>
        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-600"
        >
          다른 계정으로 로그인
        </button>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 bg-amber-50 px-4 py-8">
      <h1 className="text-lg font-semibold text-stone-800">캐릭터 이미지 풀 관리</h1>

      <div className="flex flex-col gap-4 rounded-2xl bg-white p-4 shadow-sm">
        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">무드 태그 (택 1)</p>
          <div className="flex flex-wrap gap-2">
            {PERSONA_MOOD_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedMood((prev) => (prev === tag ? null : tag))}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  selectedMood === tag ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">활동 태그 (여러 개 가능)</p>
          <div className="flex flex-wrap gap-2">
            {PERSONA_ACTIVITY_TAGS.map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleActivity(tag)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  selectedActivities.includes(tag) ? 'bg-amber-500 text-white' : 'bg-stone-100 text-stone-600'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">자유 태그 (쉼표로 구분, 예: 토끼, 안경)</p>
          <input
            value={freeTags}
            onChange={(e) => setFreeTags(e.target.value)}
            placeholder="토끼, 안경"
            className="w-full rounded-full border border-stone-200 px-4 py-2 text-sm outline-none focus:border-amber-400"
          />
        </div>

        <div>
          <p className="mb-2 text-sm font-medium text-stone-700">이미지 파일 (여러 개 선택하면 같은 태그로 한 번에 등록)</p>
          <input type="file" accept="image/*" multiple onChange={handleFileChange} className="text-sm" />
          {files.length > 0 && <p className="mt-1 text-xs text-stone-400">{files.length}개 선택됨</p>}
        </div>

        <button
          type="button"
          onClick={handleUpload}
          disabled={uploading}
          className="self-start rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {uploading ? '업로드 중...' : '업로드'}
        </button>
        {message && <p className="text-xs text-stone-500">{message}</p>}
      </div>

      <div>
        <p className="mb-2 text-sm font-medium text-stone-700">등록된 이미지 ({images.length})</p>
        {loadingList ? (
          <p className="text-sm text-stone-400">불러오는 중...</p>
        ) : images.length === 0 ? (
          <p className="text-sm text-stone-400">아직 등록된 이미지가 없어요.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {images.map((img) => (
              <div key={img.id} className="flex flex-col gap-1 rounded-xl bg-white p-2 shadow-sm">
                <img
                  src={img.image_url}
                  alt={img.tags.join(', ')}
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <p className="text-xs break-words text-stone-500">{img.tags.join(', ')}</p>
                <button
                  type="button"
                  onClick={() => handleDelete(img.id)}
                  disabled={deletingId === img.id}
                  className="text-xs text-red-400 underline disabled:opacity-50"
                >
                  {deletingId === img.id ? '삭제 중...' : '삭제'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
