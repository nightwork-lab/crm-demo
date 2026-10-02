/**
 * 顧客・紐付けの書き込み。DATA_SOURCE に応じて JSON または Supabase。
 * Supabase モードではセッションクライアント（RLS 適用）を使い、
 * ログイン中のセラピスト自身のデータとして保存される。
 * server side 専用。
 */
import { randomUUID } from 'crypto'
import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { dataDir, dataPath } from '../data-dir'
import { getDataSource } from '../data-source'
import { createSupabaseSessionClient } from '../supabase-server'
import { getCurrentTherapistId } from '../auth-context'
import { loadCustomers, type Customer } from '../data'
import type { CustomerLink, CustomerLinksFile } from '../customer-link'

const CUSTOMERS_PATH = dataPath('customers.json')
const LINKS_PATH     = dataPath('customer-links.json')

// ---------- JSON ヘルパー ----------

function loadCustomersJson(): Customer[] {
  try {
    const parsed = JSON.parse(readFileSync(CUSTOMERS_PATH, 'utf-8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function atomicWriteCustomers(customers: Customer[]) {
  mkdirSync(dataDir(), { recursive: true })
  const tmp = CUSTOMERS_PATH + '.tmp'
  writeFileSync(tmp, JSON.stringify(customers, null, 2), 'utf-8')
  renameSync(tmp, CUSTOMERS_PATH)
}

function loadLinksFile(): CustomerLinksFile {
  try {
    const file = JSON.parse(readFileSync(LINKS_PATH, 'utf-8')) as CustomerLinksFile
    if (!Array.isArray(file.links)) file.links = []
    return file
  } catch {
    return { links: [] }
  }
}

function writeLinksFile(file: CustomerLinksFile) {
  mkdirSync(dataDir(), { recursive: true })
  writeFileSync(LINKS_PATH, JSON.stringify(file, null, 2), 'utf-8')
}

async function requireSession() {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  const supabase    = await createSupabaseSessionClient()
  const therapistId = await getCurrentTherapistId()
  if (!supabase || !therapistId) throw new Error('ログインが必要です')
  return { supabase, therapistId }
}

// ---------- 顧客作成 ----------

export type NewCustomerInput = {
  name:           string
  memo:           string
  tags:           string[] | undefined
  happCustomerId: number
}

/** 顧客を新規作成し happ 顧客と紐付ける。作成した CRM 顧客 ID を返す。 */
export async function createCustomerWithLink(input: NewCustomerInput): Promise<string> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  const today = new Date().toISOString().slice(0, 10)

  if (getDataSource() !== 'supabase') {
    // 既存の連番 ID 方式（JSON）
    const all   = loadCustomers()
    const maxId = all.map((c) => parseInt(c.id, 10)).filter((n) => !isNaN(n)).reduce((m, n) => Math.max(m, n), 0)
    const newId = String(maxId + 1)

    const json = loadCustomersJson()
    json.push({
      id: newId, name: input.name, lastVisit: today,
      totalSales: 0, repeatCount: 0, memo: input.memo, tags: input.tags,
      updatedAt: new Date().toISOString(),
    })
    atomicWriteCustomers(json)

    const linksFile = loadLinksFile()
    linksFile.links = linksFile.links.filter((l) => l.happCustomerId !== input.happCustomerId)
    linksFile.links.push({
      happCustomerId: input.happCustomerId,
      crmCustomerId:  newId,
      linkedAt:       new Date().toISOString(),
      linkedBy:       'manual',
      note:           `新規顧客登録: ${input.name}`,
    })
    writeLinksFile(linksFile)
    return newId
  }

  // Supabase: ID は UUID（セラピスト間の衝突を防ぐ）
  const { supabase, therapistId } = await requireSession()
  const newId = randomUUID()

  const { error: custErr } = await supabase.from('customers').insert({
    id:           newId,
    name:         input.name,
    memo:         input.memo,
    tags:         input.tags ?? [],
    last_visit:   today,
    total_sales:  0,
    repeat_count: 0,
    updated_at:   new Date().toISOString(),
    therapist_id: therapistId,
  })
  if (custErr) throw new Error(`顧客作成: ${custErr.message}`)

  const { error: linkErr } = await supabase.from('customer_links').upsert({
    happ_customer_id: input.happCustomerId,
    crm_customer_id:  newId,
    linked_at:        new Date().toISOString(),
    linked_by:        'manual',
    note:             `新規顧客登録: ${input.name}`,
    therapist_id:     therapistId,
  }, { onConflict: 'therapist_id,happ_customer_id' })
  if (linkErr) throw new Error(`紐付け: ${linkErr.message}`)

  return newId
}

// ---------- 顧客更新 ----------

export type CustomerUpdate = Partial<
  Pick<Customer, 'name' | 'tags' | 'memo' | 'birthday' | 'alertExcluded' | 'alertExcludeReason' | 'predictionExclude'>
>

/** 顧客の一部フィールドを更新する。undefined のフィールドは変更しない。 */
export async function updateCustomerFields(id: string, update: CustomerUpdate): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    const customers = loadCustomersJson()
    const idx = customers.findIndex((c) => c.id === id)
    if (idx === -1) throw new Error('顧客が見つかりません')
    customers[idx] = { ...customers[idx], ...update, updatedAt: new Date().toISOString() }
    atomicWriteCustomers(customers)
    return
  }

  const { supabase } = await requireSession()
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if ('name' in update)               row.name                 = update.name
  if ('tags' in update)               row.tags                 = update.tags ?? []
  if ('memo' in update)               row.memo                 = update.memo
  if ('birthday' in update)           row.birthday             = update.birthday ?? null
  if ('alertExcluded' in update)      row.alert_excluded       = update.alertExcluded ?? false
  if ('alertExcludeReason' in update) row.alert_exclude_reason = update.alertExcludeReason ?? null
  if ('predictionExclude' in update)  row.prediction_exclude   = update.predictionExclude ?? null

  const { data, error } = await supabase.from('customers').update(row).eq('id', id).select('id')
  if (error) throw new Error(`顧客更新: ${error.message}`)
  if (!data || data.length === 0) throw new Error('顧客が見つかりません（権限がない可能性があります）')
}

// ---------- 紐付け ----------

export async function saveLink(
  happCustomerId: number,
  crmCustomerId:  string,
  note:           string,
): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    const file = loadLinksFile()
    file.links = file.links.filter((l) => l.happCustomerId !== happCustomerId)
    file.links.push({
      happCustomerId, crmCustomerId,
      linkedAt: new Date().toISOString(),
      linkedBy: 'manual',
      note,
    })
    writeLinksFile(file)
    return
  }

  const { supabase, therapistId } = await requireSession()
  const { error } = await supabase.from('customer_links').upsert({
    happ_customer_id: happCustomerId,
    crm_customer_id:  crmCustomerId,
    linked_at:        new Date().toISOString(),
    linked_by:        'manual',
    note,
    therapist_id:     therapistId,
  }, { onConflict: 'therapist_id,happ_customer_id' })
  if (error) throw new Error(`紐付け: ${error.message}`)
}

export async function removeLink(happCustomerId: number): Promise<void> {
  const { assertNotViewingAs } = await import('../admin-view')
  await assertNotViewingAs()
  if (getDataSource() !== 'supabase') {
    const file = loadLinksFile()
    file.links = file.links.filter((l) => l.happCustomerId !== happCustomerId)
    writeLinksFile(file)
    return
  }

  const { supabase, therapistId } = await requireSession()
  const { error } = await supabase
    .from('customer_links')
    .delete()
    .eq('therapist_id', therapistId)
    .eq('happ_customer_id', happCustomerId)
  if (error) throw new Error(`紐付け解除: ${error.message}`)
}
