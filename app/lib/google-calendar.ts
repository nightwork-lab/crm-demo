/**
 * Google Calendar API クライアント（サービスアカウント認証・依存追加なし）。
 *
 * OAuth のリフレッシュトークン管理を避けるため、サービスアカウントの秘密鍵で
 * JWT を自己署名してアクセストークンと交換する方式を使う。Node 標準の crypto
 * だけで完結するため googleapis パッケージ（約20MB）を足す必要がない。
 *
 * **削除できるのは仮予約由来のイベントだけ。** 削除メソッドはイベント本体を受け取り、
 * 「このアプリ製」かつ「仮予約として作られた」ことを自分で再検証してからでないと
 * DELETE を発行しない。確定予約・手で入れた予定は、呼び出し側が何をしても消せない。
 *
 * 必要な環境変数（ローカルの環境変数ファイルに設定する）:
 *   GOOGLE_SA_EMAIL          サービスアカウントのメールアドレス
 *   GOOGLE_SA_PRIVATE_KEY    サービスアカウントJSONキーの private_key（改行は \n のままでよい）
 *   GOOGLE_CALENDAR_ID       書き込み先カレンダーID（顧客名あり版）
 *   GOOGLE_CALENDAR_ID_ANON  顧客名なし版の書き込み先（任意。未設定なら上と同じ）
 *
 * サーバー専用。Client Component からインポートしないこと。
 */
import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const API_BASE  = 'https://www.googleapis.com/calendar/v3'
const SCOPE     = 'https://www.googleapis.com/auth/calendar'

/** このアプリが作成したイベントを識別する印。他人の予定を絶対に触らないための安全弁。 */
export const EVENT_SOURCE_TAG = 'custmer-crm'

export type CalendarEvent = {
  id:          string
  summary:     string
  description: string
  start:       { dateTime: string; timeZone: string }
  end:         { dateTime: string; timeZone: string }
  /** 'confirmed' | 'tentative'。仮予約は Google 側でも未確定として登録する。 */
  status?:     string
  extendedProperties?: { private?: Record<string, string> }
}

export type GoogleConfig = {
  email:      string
  privateKey: string
  calendarId: string
}

/**
 * サービスアカウントJSONをファイルから読む（GOOGLE_SA_KEY_FILE 方式）。
 * 秘密鍵の改行をエスケープして貼る必要がなくなるため、こちらを推奨する。
 * 読めない・壊れている場合は理由を返す。鍵の中身は返り値にも例外にも含めない。
 */
function readKeyFile(path: string):
  { ok: true; email: string; privateKey: string } | { ok: false; reason: string } {
  let raw: string
  try {
    raw = readFileSync(path.replace(/^~/, homedir()), 'utf8')
  } catch {
    return { ok: false, reason: `GOOGLE_SA_KEY_FILE のパスにファイルが見つかりません: ${path}` }
  }
  try {
    const json = JSON.parse(raw) as { client_email?: string; private_key?: string }
    if (!json.client_email || !json.private_key) {
      return { ok: false, reason: 'JSONに client_email / private_key が見つかりません（サービスアカウントの鍵ファイルか確認してください）' }
    }
    return { ok: true, email: json.client_email, privateKey: json.private_key }
  } catch {
    return { ok: false, reason: 'GOOGLE_SA_KEY_FILE のファイルがJSONとして読めません' }
  }
}

/** 予約の種別。確定と仮予約は別カレンダーへ書き込む。 */
export type ReservationKind = 'confirmed' | 'tentative'

/**
 * このアプリが作成したイベントか。ID の形と識別タグの両方が揃った場合のみ true。
 * **書き込み可否の唯一の定義元。** 同じ判定を他所に書き写さないこと。
 */
export function isOwnEvent(e: CalendarEvent): boolean {
  return /^happ\d+$/.test(e.id) && e.extendedProperties?.private?.source === EVENT_SOURCE_TAG
}

/**
 * 削除してよいイベントか。**削除可否の唯一の定義元。**
 * このアプリ製で、かつ仮予約として作られたものだけ。
 */
export function isDeletableTentative(e: CalendarEvent): boolean {
  return isOwnEvent(e) && e.extendedProperties?.private?.kind === 'tentative'
}

/** 種別と表記の組み合わせから書き込み先カレンダーIDを決める。 */
function resolveCalendarId(
  kind: ReservationKind, includeCustomerName: boolean,
): { id: string | undefined; label: string } {
  if (kind === 'tentative') {
    return {
      id: includeCustomerName
        ? process.env.GOOGLE_CALENDAR_ID_TENTATIVE
        : (process.env.GOOGLE_CALENDAR_ID_TENTATIVE_ANON || process.env.GOOGLE_CALENDAR_ID_TENTATIVE),
      label: 'GOOGLE_CALENDAR_ID_TENTATIVE',
    }
  }
  return {
    id: includeCustomerName
      ? process.env.GOOGLE_CALENDAR_ID
      : (process.env.GOOGLE_CALENDAR_ID_ANON || process.env.GOOGLE_CALENDAR_ID),
    label: 'GOOGLE_CALENDAR_ID',
  }
}

/**
 * サービスアカウントJSONを文字列から読む（GOOGLE_SA_KEY_JSON 方式）。
 * Vercel のようにファイルを置けない環境向け。JSONを丸ごと1変数に貼るだけで済み、
 * 秘密鍵の改行をエスケープする必要がない。
 */
function readKeyJson(raw: string):
  { ok: true; email: string; privateKey: string } | { ok: false; reason: string } {
  try {
    const json = JSON.parse(raw) as { client_email?: string; private_key?: string }
    if (!json.client_email || !json.private_key) {
      return { ok: false, reason: 'GOOGLE_SA_KEY_JSON に client_email / private_key がありません' }
    }
    return { ok: true, email: json.client_email, privateKey: json.private_key }
  } catch {
    return { ok: false, reason: 'GOOGLE_SA_KEY_JSON がJSONとして読めません（値が途中で切れていないか確認してください）' }
  }
}

/**
 * 資格情報が揃っているか。**「設定済み」判定の唯一の定義元。**
 * 画面のバッジ・有効/無効判定・実際の読み込みで必ずこれを使うこと
 * （同じ判定を書き写して実態とずれる不具合を過去に出している）。
 */
export function hasGoogleCredentials(): boolean {
  return Boolean(
    process.env.GOOGLE_SA_KEY_JSON ||
    process.env.GOOGLE_SA_KEY_FILE ||
    (process.env.GOOGLE_SA_EMAIL && process.env.GOOGLE_SA_PRIVATE_KEY),
  )
}

/** 設定済みのカレンダーID。本番へ移すときに画面へ表示するために使う。 */
export function getConfiguredCalendarIds(): { confirmed?: string; tentative?: string } {
  return {
    confirmed: process.env.GOOGLE_CALENDAR_ID,
    tentative: process.env.GOOGLE_CALENDAR_ID_TENTATIVE,
  }
}

/** 環境変数から設定を読む。未設定の項目名を返して呼び出し元でメッセージ化する。 */
export function loadGoogleConfig(kind: ReservationKind, includeCustomerName: boolean):
  { ok: true; config: GoogleConfig } | { ok: false; missing: string[] } {
  // 優先順: JSON丸ごと（本番向け） > 鍵ファイル（ローカル向け） > 個別指定
  const keyJson = process.env.GOOGLE_SA_KEY_JSON
  const keyFile = process.env.GOOGLE_SA_KEY_FILE
  const fromKey = keyJson ? readKeyJson(keyJson) : (keyFile ? readKeyFile(keyFile) : null)
  if (fromKey && !fromKey.ok) return { ok: false, missing: [fromKey.reason] }

  const email      = fromKey?.ok ? fromKey.email      : process.env.GOOGLE_SA_EMAIL
  const privateKey = fromKey?.ok ? fromKey.privateKey : process.env.GOOGLE_SA_PRIVATE_KEY
  const { id: calendarId, label } = resolveCalendarId(kind, includeCustomerName)

  const missing: string[] = []
  if (!email)      missing.push('GOOGLE_SA_KEY_FILE または GOOGLE_SA_EMAIL')
  if (!privateKey) missing.push('GOOGLE_SA_KEY_FILE または GOOGLE_SA_PRIVATE_KEY')
  if (!calendarId) missing.push(includeCustomerName ? label : `${label}_ANON または ${label}`)
  if (missing.length > 0) return { ok: false, missing }

  return {
    ok: true,
    config: {
      email:      email as string,
      // 1行で書けるようエスケープしたままの改行を実際の改行へ戻す
      privateKey: (privateKey as string).replace(/\\n/g, '\n'),
      calendarId: calendarId as string,
    },
  }
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** サービスアカウントの秘密鍵で JWT を署名し、アクセストークンと交換する。 */
async function getAccessToken(config: GoogleConfig): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header  = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const payload = base64url(JSON.stringify({
    iss:   config.email,
    scope: SCOPE,
    aud:   TOKEN_URL,
    iat:   now,
    exp:   now + 3600,
  }))

  const signer = createSign('RSA-SHA256')
  signer.update(`${header}.${payload}`)
  const signature = base64url(signer.sign(config.privateKey))

  const res = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion:  `${header}.${payload}.${signature}`,
    }),
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`アクセストークンの取得に失敗しました (HTTP ${res.status}): ${detail.slice(0, 200)}`)
  }
  const json = await res.json() as { access_token?: string }
  if (!json.access_token) throw new Error('アクセストークンが応答に含まれていません')
  return json.access_token
}

/** 認証済みクライアント。トークンは1回の同期で使い回す。 */
export class CalendarClient {
  private constructor(
    private readonly token:      string,
    private readonly calendarId: string,
  ) {}

  static async create(config: GoogleConfig): Promise<CalendarClient> {
    const token = await getAccessToken(config)
    return new CalendarClient(token, config.calendarId)
  }

  private async request(
    path: string, init: RequestInit & { query?: Record<string, string> } = {},
  ): Promise<Response> {
    const { query, ...rest } = init
    const url = new URL(`${API_BASE}/calendars/${encodeURIComponent(this.calendarId)}${path}`)
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v)

    return fetch(url, {
      ...rest,
      headers: {
        Authorization:  `Bearer ${this.token}`,
        'Content-Type': 'application/json',
        ...(rest.headers ?? {}),
      },
    })
  }

  /**
   * このアプリが作成したイベントだけを列挙する。
   * extendedProperties で絞り込むため、カレンダー上の他の予定は結果に含まれない。
   */
  async listOwnEvents(timeMin: string, timeMax: string): Promise<CalendarEvent[]> {
    const events: CalendarEvent[] = []
    let pageToken: string | undefined

    do {
      const query: Record<string, string> = {
        timeMin, timeMax,
        maxResults:              '250',
        showDeleted:             'false',
        privateExtendedProperty: `source=${EVENT_SOURCE_TAG}`,
      }
      if (pageToken) query.pageToken = pageToken

      const res = await this.request('/events', { method: 'GET', query })
      if (!res.ok) {
        const detail = await res.text()
        throw new Error(`イベント一覧の取得に失敗しました (HTTP ${res.status}): ${detail.slice(0, 200)}`)
      }
      const json = await res.json() as { items?: CalendarEvent[]; nextPageToken?: string }
      events.push(...(json.items ?? []))
      pageToken = json.nextPageToken
    } while (pageToken)

    return events
  }

  /** イベントを作成する。ID は呼び出し元が決定的に採番する。 */
  async insertEvent(event: CalendarEvent): Promise<void> {
    const res = await this.request('/events', { method: 'POST', body: JSON.stringify(event) })
    // 同じIDのイベントが照合窓の外に既にある場合は 409。作成ではなく更新に切り替える。
    if (res.status === 409) { await this.updateEvent(event); return }
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`イベント作成に失敗しました (HTTP ${res.status}): ${detail.slice(0, 200)}`)
    }
  }

  /** イベントを更新する（全置換）。 */
  async updateEvent(event: CalendarEvent): Promise<void> {
    const res = await this.request(`/events/${encodeURIComponent(event.id)}`, {
      method: 'PUT', body: JSON.stringify(event),
    })
    if (!res.ok) {
      const detail = await res.text()
      throw new Error(`イベント更新に失敗しました (HTTP ${res.status}): ${detail.slice(0, 200)}`)
    }
  }

  /**
   * **仮予約由来のイベントに限って**削除する。
   *
   * ID 文字列ではなくイベント本体を受け取り、このメソッド自身が対象を再検証する。
   * 呼び出し側がどんな値を渡しても、次の条件を全て満たさないものは削除されない。
   *   - ID が happ<数字> の形
   *   - このアプリが付けた識別タグを持つ
   *   - 種別タグが tentative（＝仮予約として作られた）
   * 確定予約・手で入れた予定・過去の予定は、この経路では消せない。
   *
   * @returns 実際に削除したら true、条件を満たさず見送ったら false
   */
  async deleteTentativeEvent(event: CalendarEvent): Promise<boolean> {
    if (!isDeletableTentative(event)) return false

    const res = await this.request(`/events/${encodeURIComponent(event.id)}`, { method: 'DELETE' })
    // 既に無い場合(404/410)は目的を達しているので成功扱い
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      const detail = await res.text()
      throw new Error(`イベント削除に失敗しました (HTTP ${res.status}): ${detail.slice(0, 200)}`)
    }
    return true
  }
}
