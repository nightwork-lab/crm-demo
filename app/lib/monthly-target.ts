import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'fs'
import { dataDir, dataPath } from './data-dir'

export type MonthlyTarget = {
  targetMonth:   string  // "YYYY-MM"
  targetRevenue: number
  updatedAt:     string  // ISO8601
}

type TargetsFile = {
  targets: MonthlyTarget[]
}

const FILE = dataPath('monthly-targets.json')

export function loadMonthlyTargets(): MonthlyTarget[] {
  try {
    const raw  = readFileSync(FILE, 'utf-8')
    const file = JSON.parse(raw) as TargetsFile
    return file.targets ?? []
  } catch {
    return []
  }
}

export function getMonthlyTarget(targetMonth: string): MonthlyTarget | null {
  return loadMonthlyTargets().find((t) => t.targetMonth === targetMonth) ?? null
}

export function upsertMonthlyTarget(
  target: Omit<MonthlyTarget, 'updatedAt'>,
): MonthlyTarget {
  const all = loadMonthlyTargets()
  const idx = all.findIndex((t) => t.targetMonth === target.targetMonth)
  const updated: MonthlyTarget = { ...target, updatedAt: new Date().toISOString() }
  if (idx >= 0) { all[idx] = updated } else { all.push(updated) }
  mkdirSync(dataDir(), { recursive: true })
  const tmp = FILE + '.tmp'
  writeFileSync(tmp, JSON.stringify({ targets: all }, null, 2), 'utf-8')
  renameSync(tmp, FILE)
  return updated
}
