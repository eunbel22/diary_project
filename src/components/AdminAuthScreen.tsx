import { supabase } from '../supabaseClient'

// /imageadd 전용 로그인 화면. 일반 사용자용 AuthScreen(이메일/비밀번호)과 별개로, 여기서는
// 구글 로그인만 제공한다 — 실제로 어떤 계정만 허용할지는 api/admin-persona-image.ts가
// ADMIN_EMAIL 환경변수로 서버에서 검증한다(여기서 보여주는 건 로그인 진입점일 뿐).
export function AdminAuthScreen() {
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/imageadd` },
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-amber-50 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-sm">
        <h1 className="mb-1 text-xl font-semibold text-stone-800">관리자 페이지</h1>
        <p className="mb-6 text-sm text-stone-500">허용된 구글 계정으로만 들어올 수 있어요.</p>
        <button
          type="button"
          onClick={handleGoogleLogin}
          className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          구글로 로그인
        </button>
      </div>
    </div>
  )
}
