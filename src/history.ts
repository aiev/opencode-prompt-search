import type { Context, MessageInfo } from "./types"

export type HistoryEntry = {
  readonly text: string
  readonly sessionID: string
  readonly sessionTitle?: string
  readonly created: number
  readonly directory?: string
}

export type HistoryCache = {
  entries: HistoryEntry[]
  fetched: Record<string, number>
  loadedAllAt: number
}

export const CACHE_KEY = "prompt-history.cache"
export const CACHE_TTL_MS = 20_000
export const MAX_ENTRIES = 500
export const MAX_MESSAGES_PER_SESSION = 100
export const MAX_SESSIONS = 60

export function normalizeText(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim()
}

export function preview(value: string, max = 140): string {
  const oneLine = value.replace(/\s+/g, " ").trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

function toMillis(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  return value < 1_000_000_000_000 ? value * 1000 : value
}

export function timeAgo(created: number, now = Date.now()): string {
  const timestamp = toMillis(created)
  if (!timestamp) return ""

  const diff = Math.max(0, now - timestamp)
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  if (diff < minute) return "agora"
  if (diff < hour) return `${Math.floor(diff / minute)}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d`
  if (diff < 30 * day) return `${Math.floor(diff / (7 * day))}sem`
  return new Date(timestamp).toLocaleDateString("pt-BR")
}

export function mergeEntries(
  existing: readonly HistoryEntry[],
  incoming: readonly HistoryEntry[],
): HistoryEntry[] {
  const byText = new Map<string, HistoryEntry>()

  for (const entry of [...existing, ...incoming]) {
    const text = normalizeText(entry.text)
    if (!text) continue

    const candidate: HistoryEntry = { ...entry, text }
    const current = byText.get(text)
    if (!current || candidate.created > current.created) {
      byText.set(text, candidate)
    }
  }

  return [...byText.values()]
    .sort((left, right) => right.created - left.created)
    .slice(0, MAX_ENTRIES)
}

async function pool<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0
  const runners = Array.from(
    { length: Math.max(1, Math.min(concurrency, items.length)) },
    async () => {
      while (true) {
        const current = index++
        if (current >= items.length) return
        await worker(items[current]!)
      }
    },
  )
  await Promise.all(runners)
}

export async function fetchHistory(
  context: Context,
  options: { readonly directory?: string; readonly all: boolean },
): Promise<HistoryEntry[]> {
  const response = await context.client.session.list({
    limit: MAX_SESSIONS,
    order: "desc",
    parentID: null,
    directory: options.all ? undefined : options.directory,
  })

  const sessions = response.data.filter((session) => !session.parentID)
  const entries: HistoryEntry[] = []

  await pool(sessions, 6, async (session) => {
    try {
      const messages = await context.client.message.list({
        sessionID: session.id,
        type: "user",
        limit: MAX_MESSAGES_PER_SESSION,
        order: "desc",
      })

      for (const message of messages.data as readonly MessageInfo[]) {
        if (message.type !== "user") continue
        const text = typeof message.text === "string" ? normalizeText(message.text) : ""
        if (!text) continue

        entries.push({
          text,
          sessionID: session.id,
          sessionTitle: session.title,
          created: toMillis(message.time?.created ?? session.time.updated),
          directory: session.location?.directory ?? options.directory,
        })
      }
    } catch {
      // One unreadable session should not break the whole search.
    }
  })

  return mergeEntries([], entries)
}
