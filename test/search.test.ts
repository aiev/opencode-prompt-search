import { test } from "node:test"
import assert from "node:assert/strict"
import { mergeEntries, normalizeText, preview, timeAgo } from "../src/history"
import { matchScore, sortOptions } from "../src/search"

test("normalizeText normalizes line endings and trims", () => {
  assert.equal(normalizeText("  a\r\nb\r  "), "a\nb")
})

test("preview collapses whitespace and truncates", () => {
  assert.equal(preview("  hello\n\nworld  "), "hello world")
  assert.equal(preview("a".repeat(20), 10), "aaaaaaaaa…")
})

test("timeAgo formats recent and older timestamps", () => {
  const now = 1_700_000_000_000
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour

  assert.equal(timeAgo(now - 5_000, now), "agora")
  assert.equal(timeAgo(now - 5 * minute, now), "5m")
  assert.equal(timeAgo(now - 3 * hour, now), "3h")
  assert.equal(timeAgo(now - 3 * day, now), "3d")
  assert.equal(timeAgo(now - 10 * day, now), "1sem")
  assert.notEqual(timeAgo(now - 60 * day, now), "")
})

test("timeAgo accepts seconds", () => {
  const now = 1_700_000_000_000
  assert.equal(timeAgo(Math.floor((now - 5 * 60_000) / 1000), now), "5m")
})

test("mergeEntries deduplicates by text and keeps the newest", () => {
  const merged = mergeEntries(
    [{ text: "a", created: 1, sessionID: "one" }],
    [{ text: " a ", created: 2, sessionID: "two" }],
  )

  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.text, "a")
  assert.equal(merged[0]?.created, 2)
  assert.equal(merged[0]?.sessionID, "two")
})

test("mergeEntries sorts newest first", () => {
  const merged = mergeEntries(
    [],
    [
      { text: "old", created: 1, sessionID: "one" },
      { text: "new", created: 3, sessionID: "one" },
      { text: "middle", created: 2, sessionID: "one" },
    ],
  )

  assert.deepEqual(
    merged.map((entry) => entry.text),
    ["new", "middle", "old"],
  )
})

test("matchScore prefers direct matches over subsequences", () => {
  const direct = matchScore("bug", "fix bug")
  const subsequence = matchScore("fxbg", "fix bug")

  assert.ok(direct > subsequence)
  assert.ok(subsequence > 0)
  assert.equal(matchScore("zzz", "fix bug"), -1)
})

test("matchScore requires every token", () => {
  assert.ok(matchScore("fix bug", "please fix this bug") > 0)
  assert.equal(matchScore("fix nada", "please fix this bug"), -1)
})

test("sortOptions keeps recency order for an empty query", () => {
  const options = [
    { title: "one", value: "first" },
    { title: "two", value: "second" },
  ]

  assert.deepEqual(sortOptions("", options), options)
})

test("sortOptions ranks matches and filters misses", () => {
  const options = [
    { title: "refactor", value: "refactor auth" },
    { title: "fix", value: "fix auth bug" },
    { title: "docs", value: "write docs" },
  ]

  assert.deepEqual(
    sortOptions("auth", options).map((option) => option.title),
    ["fix", "refactor"],
  )
})
