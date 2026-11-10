import { test } from "node:test"
import assert from "node:assert/strict"
import plugin from "../src/index"
import type { Context, DialogSelectOptions, KeymapCommand, KeymapLayer } from "../src/types"

type HarnessOptions = {
  readonly messages?: readonly { type: string; text?: string; time?: { created?: number } }[]
  readonly select?: string
  readonly focused?: boolean
  readonly sessions?: readonly {
    id: string
    title?: string
    parentID?: string
    time: { created: number; updated: number }
    location?: { directory: string }
  }[]
}

function createHarness(options: HarnessOptions = {}) {
  const inserted: string[] = []
  const toasts: string[] = []
  const layers: KeymapLayer[] = []
  const listInputs: unknown[] = []
  let dialogOptions: DialogSelectOptions<string> | undefined
  let eventHandler: ((event: unknown) => void) | undefined

  const sessions = options.sessions ?? [
    {
      id: "s1",
      title: "Sessão de teste",
      time: { created: 1_000, updated: 2_000 },
      location: { directory: "/project" },
    },
  ]

  const messages =
    options.messages ??
    [
      { type: "user", text: "first prompt", time: { created: 1_000 } },
      { type: "user", text: "second prompt", time: { created: 2_000 } },
    ]

  const context = {
    app: { version: "test", channel: "test" },
    location: { directory: "/project" },
    client: {
      session: {
        list: async (input: unknown) => {
          listInputs.push(input)
          return { data: sessions, cursor: {} }
        },
      },
      message: {
        list: async () => ({ data: messages, cursor: {} }),
      },
    },
    data: {
      on: (_type: string, handler: (event: unknown) => void) => {
        eventHandler = handler
        return () => {}
      },
      session: {
        get: (sessionID: string) => sessions.find((session) => session.id === sessionID),
      },
    },
    renderer: {
      currentFocusedEditor:
        options.focused === false
          ? null
          : {
              isDestroyed: false,
              focus() {},
              insertText(text: string) {
                inserted.push(text)
              },
              gotoBufferEnd() {},
            },
    },
    storage: {
      memory: (_key: string, { initial }: { initial: object }) => {
        const store = structuredClone(initial) as Record<string, unknown>
        return [
          store,
          (mutation: (draft: Record<string, unknown>) => void) => {
            mutation(store)
          },
        ] as const
      },
    },
    keymap: {
      layer: (factory: () => KeymapLayer) => {
        layers.push(factory())
      },
    },
    ui: {
      dialog: {
        select: async (input: DialogSelectOptions<string>) => {
          dialogOptions = input
          return options.select ?? "second prompt"
        },
      },
      toast: {
        show: ({ message }: { message: string }) => {
          toasts.push(message)
        },
      },
      router: {
        current: () => ({ type: "session", sessionID: "s1" }),
      },
    },
  } as unknown as Context

  const cleanup = plugin.setup(context)

  const command = (id: string): KeymapCommand => {
    const found = layers
      .flatMap((layer) => layer.commands ?? [])
      .find((candidate) => candidate.id === id)
    if (!found) throw new Error(`command ${id} not registered`)
    return found
  }

  return {
    inserted,
    toasts,
    layers,
    listInputs,
    command,
    cleanup,
    get dialogOptions() {
      return dialogOptions
    },
    get eventHandler() {
      return eventHandler
    },
  }
}

test("registers the ctrl+shift+r command", () => {
  const harness = createHarness()
  const command = harness.command("prompt-history.search")

  assert.equal(command.bind, "ctrl+shift+r")
  assert.equal(command.palette, true)
  assert.equal(harness.command("prompt-history.search-all").bind, undefined)
})

test("loads history, opens the dialog and inserts the selected prompt", async () => {
  const harness = createHarness({ select: "second prompt" })
  await harness.command("prompt-history.search").run()

  assert.deepEqual(harness.inserted, ["second prompt"])
  assert.equal(harness.dialogOptions?.options.length, 2)
  assert.equal(harness.dialogOptions?.options[0]?.value, "second prompt")
  assert.equal(harness.dialogOptions?.options[0]?.category, "Sessão atual")
  assert.equal(harness.toasts.at(-1), "Prompt inserido. Edite e pressione Enter.")
})

test("dialog search filters by query", async () => {
  const harness = createHarness()
  await harness.command("prompt-history.search").run()

  const filtered = harness.dialogOptions?.search?.("first", harness.dialogOptions.options)
  assert.deepEqual(
    filtered?.map((option) => option.value),
    ["first prompt"],
  )
})

test("shows an error when no prompt editor is focused", async () => {
  const harness = createHarness({ focused: false })
  await harness.command("prompt-history.search").run()

  assert.deepEqual(harness.inserted, [])
  assert.match(harness.toasts.at(-1) ?? "", /Não encontrei o campo de prompt focado/)
})

test("shows a warning when there is no history", async () => {
  const harness = createHarness({ messages: [] })
  await harness.command("prompt-history.search").run()

  assert.equal(harness.dialogOptions, undefined)
  assert.equal(harness.toasts.at(-1), "Nenhum prompt encontrado neste projeto.")
})

test("adds newly enqueued prompts to the cache", async () => {
  const harness = createHarness()
  await harness.command("prompt-history.search").run()

  harness.eventHandler?.({
    data: {
      sessionID: "s1",
      item: { type: "user", payload: { text: "third prompt" } },
    },
  })

  await harness.command("prompt-history.search").run()

  assert.deepEqual(
    harness.dialogOptions?.options.map((option) => option.value),
    ["third prompt", "second prompt", "first prompt"],
  )
})

test("search-all queries every session", async () => {
  const harness = createHarness()
  await harness.command("prompt-history.search-all").run()

  assert.deepEqual(harness.listInputs[0], {
    limit: 60,
    order: "desc",
    parentID: null,
    directory: undefined,
  })
})
