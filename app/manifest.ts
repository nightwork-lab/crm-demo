import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name:             '顧客管理CRM',
    short_name:       'CRM',
    description:      '顧客管理・来店アラート・売上管理アプリ',
    start_url:        '/',
    scope:            '/',
    display:          'standalone',
    background_color: '#ffffff',
    theme_color:      '#111827',
    orientation:      'portrait',
    icons: [
      {
        src:   '/icon-192.png',
        sizes: '192x192',
        type:  'image/png',
      },
      {
        src:     '/icon-512.png',
        sizes:   '512x512',
        type:    'image/png',
        purpose: 'maskable',
      },
    ],
  }
}
