import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'AI 다이어리',
        short_name: '다이어리',
        description: '말하면 판단 없이 정리해주는 AI 다이어리',
        lang: 'ko',
        theme_color: '#f59e0b',
        background_color: '#fffbeb',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        // 홈 화면 아이콘을 길게 눌렀을 때 뜨는 바로가기. 이 라벨은 모든 사용자가
        // 공유하는 정적 manifest라 개인화할 수 없어 고정 문구로 둔다(대기 항목).
        // 실제 진입 모드(텍스트/음성)는 앱이 로드될 때 persona.quick_entry_mode를
        // 읽어서 결정한다.
        shortcuts: [
          {
            name: '빠른 기록',
            short_name: '빠른 기록',
            url: '/?quick=1',
            icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
          },
        ],
      },
    }),
  ],
})
