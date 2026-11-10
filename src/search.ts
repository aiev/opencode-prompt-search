import type { DialogSelectOption } from "./types"
import { preview, timeAgo, type HistoryEntry } from "./history"

function matchToken(token: string, haystack: string): number {
  const direct = haystack.indexOf(token)
  if (direct >= 0) {
    const density = token.length / Math.max(haystack.length, 1)
    return 10_000 - Math.min(direct, 500) + density * 100
  }

  let cursor = 0
  let streak = 0
  let bestStreak = 0

  for (const character of token) {
    const found = haystack.indexOf(character, cursor)
    if (found < 0) return -1
    if (found === cursor) {
      streak++
      if (streak > bestStreak) bestStreak = streak
    } else {
      streak = 0
    }
    cursor = found + 1
  }

  return 1_000 + bestStreak * 25 - Math.min(haystack.length / 8, 100)
}

export function matchScore(query: string, text: string): number {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return 0

  const haystack = text.toLowerCase()
  let total = 0

  for (const token of tokens) {
    const score = matchToken(token, haystack)
    if (score < 0) return -1
    total += score
  }

  return total
}

export function sortOptions(
  query: string,
  options: readonly DialogSelectOption<string>[],
): DialogSelectOption<string>[] {
  if (!query.trim()) return [...options]

  return options
    .map((option, index) => ({
      option,
      index,
      score: matchScore(query, option.value),
    }))
    .filter((item) => item.score >= 0)
    .sort((left, right) => right.score - left.score || left.index - right.index)
    .map((item) => item.option)
}

export function toOptions(
  entries: readonly HistoryEntry[],
  currentSessionID?: string,
): DialogSelectOption<string>[] {
  return entries.map((entry) => {
    const description = [timeAgo(entry.created), entry.sessionTitle]
      .filter((part): part is string => Boolean(part))
      .join(" · ")

    return {
      title: preview(entry.text) || "(prompt vazio)",
      value: entry.text,
      description,
      category: entry.sessionID === currentSessionID ? "Sessão atual" : "Outras sessões",
    }
  })
}
