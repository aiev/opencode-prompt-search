import type { Context } from "./types"
import {
  CACHE_KEY,
  CACHE_TTL_MS,
  fetchHistory,
  mergeEntries,
  normalizeText,
  type HistoryCache,
  type HistoryEntry,
} from "./history"
import { sortOptions, toOptions } from "./search"

const COMMAND_ID = "prompt-history.search"
const COMMAND_ALL_ID = "prompt-history.search-all"
const MAX_INPUT_WAIT_MS = 300

type Scope = "project" | "all"

type EnqueuedEvent = {
  readonly data?: {
    readonly sessionID?: string
    readonly item?: {
      readonly type?: string
      readonly payload?: {
        readonly text?: string
      }
    }
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export default {
  id: "prompt-history",
  setup: setupInner,
}

function setupInner(context: Context) {
    const [cache, updateCache] = context.storage.memory<HistoryCache>(CACHE_KEY, {
      initial: {
        entries: [],
        fetched: {},
        loadedAllAt: 0,
      },
    })

    const notify = (
      message: string,
      variant: "info" | "success" | "warning" | "error" = "info",
      duration = 2_000,
    ) => {
      context.ui.toast.show({ message, variant, duration })
    }

    const load = async (scope: Scope, force = false): Promise<HistoryEntry[]> => {
      const directory = context.location?.directory
      const fetchedAt =
        scope === "all"
          ? cache.loadedAllAt
          : directory
            ? cache.fetched[directory] ?? 0
            : 0

      if (force || Date.now() - fetchedAt > CACHE_TTL_MS) {
        const fresh = await fetchHistory(context, {
          directory,
          all: scope === "all",
        })

        updateCache((draft) => {
          draft.entries = mergeEntries(draft.entries, fresh)
          if (scope === "all") {
            draft.loadedAllAt = Date.now()
          } else if (directory) {
            draft.fetched[directory] = Date.now()
          }
        })
      }

      const entries =
        scope === "all"
          ? cache.entries
          : cache.entries.filter(
              (entry) =>
                !directory || !entry.directory || entry.directory === directory,
            )

      return [...entries]
    }

    const insertIntoComposer = async (text: string): Promise<boolean> => {
      // The dialog owns focus until it closes. Give the host a moment to
      // restore focus to the prompt editor before inserting.
      const deadline = Date.now() + MAX_INPUT_WAIT_MS

      while (Date.now() <= deadline) {
        const editor = context.renderer.currentFocusedEditor
        if (editor && !editor.isDestroyed) {
          editor.focus()
          editor.insertText(text)
          editor.gotoBufferEnd()
          return true
        }
        await wait(16)
      }

      return false
    }

    const search = async (scope: Scope) => {
      const loadingTimer = setTimeout(() => {
        notify("Carregando histórico de prompts…", "info", 1_200)
      }, 250)

      let entries: HistoryEntry[]

      try {
        entries = await load(scope)
      } catch (error) {
        notify(
          `Não foi possível carregar o histórico: ${errorMessage(error)}`,
          "error",
          4_000,
        )
        return
      } finally {
        clearTimeout(loadingTimer)
      }

      if (entries.length === 0) {
        notify(
          scope === "all"
            ? "Nenhum prompt encontrado em nenhuma sessão."
            : "Nenhum prompt encontrado neste projeto.",
          "warning",
        )
        return
      }

      const route = context.ui.router.current()
      const currentSessionID = route.type === "session" ? route.sessionID : undefined

      const selected = await context.ui.dialog.select<string>({
        title:
          scope === "all"
            ? "Histórico de prompts · todas as sessões"
            : "Histórico de prompts",
        placeholder:
          scope === "all"
            ? "Digite para buscar em todas as sessões…"
            : "Digite para buscar neste projeto…",
        options: toOptions(entries, currentSessionID),
        search: (query, options) => sortOptions(query, options),
      })

      if (typeof selected !== "string" || !selected) return

      const inserted = await insertIntoComposer(selected)

      if (!inserted) {
        notify(
          "Não encontrei o campo de prompt focado. Abra o composer e tente de novo.",
          "error",
          4_000,
        )
        return
      }

      notify("Prompt inserido. Edite e pressione Enter.", "success", 1_500)
    }

    context.keymap.layer(() => ({
      mode: "global",
      priority: 10,
      commands: [
        {
          id: COMMAND_ID,
          title: "Buscar prompt no histórico",
          description: "Busca incremental nos prompts anteriores deste projeto",
          group: "Prompt history",
          bind: "ctrl+shift+r",
          palette: true,
          slash: { name: "prompt-history", aliases: ["ph"] },
          run: () => search("project"),
        },
        {
          id: COMMAND_ALL_ID,
          title: "Buscar prompt no histórico (todas as sessões)",
          description: "Busca incremental nos prompts de todos os projetos",
          group: "Prompt history",
          palette: true,
          slash: { name: "prompt-history-all", aliases: ["pha"] },
          run: () => search("all"),
        },
      ],
      bindings: [COMMAND_ID, COMMAND_ALL_ID],
    }))

    return context.data.on("session.inbox.enqueued", (event) => {
      const payload = event as EnqueuedEvent
      const sessionID = payload.data?.sessionID
      const item = payload.data?.item

      if (typeof sessionID !== "string" || item?.type !== "user") return

      const text = normalizeText(item.payload?.text ?? "")
      if (!text) return

      const session = context.data.session.get(sessionID)

      updateCache((draft) => {
        draft.entries = mergeEntries(draft.entries, [
          {
            text,
            sessionID,
            sessionTitle: session?.title,
            created: Date.now(),
            directory: session?.location?.directory,
          },
        ])
      })
    })
}
