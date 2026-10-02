/**
 * ブラウザ起動〜ログイン〜月別履歴取得（幽霊オーダー削除含む）までの一括実行。
 * Server Action から呼ばれる。server side 専用。
 */
import { fetchHistoricalMonth, type HistorySyncResult } from './happ-history'

export async function runHistorySync(
  year:  number,
  month: number,
): Promise<HistorySyncResult> {
  if (!process.env.HAPP_TEL || !process.env.HAPP_PASS) {
    throw new Error('.env.local に HAPP_TEL と HAPP_PASS を設定してください')
  }

  const { chromium } = await import('playwright')
  const browser = await chromium.launch({
    headless: true,
    args: ['--ignore-certificate-errors', '--disable-web-security', '--no-sandbox'],
  })

  try {
    const context = await browser.newContext({ ignoreHTTPSErrors: true })
    const page    = await context.newPage()

    await page.goto('https://happ-s.com/control/worker/hs/login/', { waitUntil: 'domcontentloaded' })
    await page.fill('#tel',  process.env.HAPP_TEL)
    await page.fill('#pass', process.env.HAPP_PASS)
    await page.click('button[type="submit"]')
    await page.waitForLoadState('domcontentloaded')
    if (page.url().includes('/login/')) {
      throw new Error('happ ログインに失敗しました')
    }

    return await fetchHistoricalMonth(page, year, month)
  } finally {
    await browser.close()
  }
}
