export type LocationRef = {
  readonly directory: string
}

export type SessionInfo = {
  readonly id: string
  readonly parentID?: string
  readonly title?: string
  readonly time: {
    readonly created: number
    readonly updated: number
  }
  readonly location?: LocationRef
}

export type MessageInfo = {
  readonly type: string
  readonly text?: string
  readonly time?: {
    readonly created?: number
  }
}

export type SessionsResponse = {
  readonly data: readonly SessionInfo[]
  readonly cursor: {
    readonly previous?: string | null
    readonly next?: string | null
  }
}

export type SessionMessagesResponse = {
  readonly data: readonly MessageInfo[]
  readonly cursor: {
    readonly previous?: string | null
    readonly next?: string | null
  }
}

export type EditBuffer = {
  readonly isDestroyed: boolean
  focus(): void
  insertText(text: string): void
  gotoBufferEnd(options?: unknown): void
}

export type DialogSelectOption<Value> = {
  readonly title: string
  readonly value: Value
  readonly description?: string
  readonly footer?: string
  readonly category?: string
  readonly disabled?: boolean
}

export type DialogSelectOptions<Value> = {
  readonly title: string
  readonly placeholder?: string
  readonly options: readonly DialogSelectOption<Value>[]
  readonly current?: Value
  readonly search?: (
    query: string,
    options: readonly DialogSelectOption<Value>[],
  ) => readonly DialogSelectOption<Value>[]
}

export type KeymapCommand = {
  readonly id?: string
  readonly title?: string
  readonly description?: string
  readonly group?: string
  readonly enabled?: boolean | (() => boolean)
  readonly bind?: false | string
  readonly palette?: true
  readonly slash?: {
    readonly name: string
    readonly aliases?: readonly string[]
    readonly arguments?: true
  }
  readonly suggested?: boolean | (() => boolean)
  readonly run: (input?: string, event?: unknown) => void | false | Promise<void>
}

export type KeymapLayer = {
  readonly mode?: string
  readonly enabled?: boolean | (() => boolean)
  readonly priority?: number
  readonly commands?: readonly KeymapCommand[]
  readonly bindings?: readonly string[]
}

export type ToastVariant = "info" | "success" | "warning" | "error"

export type Route =
  | { readonly type: "home" }
  | { readonly type: "session"; readonly sessionID: string }
  | { readonly type: "plugin"; readonly id: string; readonly name: string }

export type Context = {
  readonly app: {
    readonly version: string
    readonly channel: string
  }
  readonly location?: LocationRef
  readonly client: {
    readonly session: {
      list(input?: {
        readonly limit?: number
        readonly order?: "asc" | "desc"
        readonly parentID?: string | null
        readonly directory?: string
        readonly archived?: boolean
        readonly cursor?: string
      }): Promise<SessionsResponse>
    }
    readonly message: {
      list(input: {
        readonly sessionID: string
        readonly type?: "user" | string
        readonly limit?: number
        readonly order?: "asc" | "desc"
        readonly cursor?: string
      }): Promise<SessionMessagesResponse>
    }
  }
  readonly data: {
    on(type: string, handler: (event: unknown) => void): () => void
    readonly session: {
      get(sessionID: string): SessionInfo | undefined
    }
  }
  readonly renderer: {
    readonly currentFocusedEditor: EditBuffer | null
  }
  readonly storage: {
    memory<Value extends object>(
      key: string,
      options: { readonly initial: Value },
    ): readonly [Value, (mutation: (draft: Value) => void) => void]
  }
  readonly keymap: {
    layer(factory: () => KeymapLayer): void
  }
  readonly ui: {
    readonly dialog: {
      select<Value>(options: DialogSelectOptions<Value>): Promise<Value | undefined>
    }
    readonly toast: {
      show(options: {
        readonly title?: string
        readonly message: string
        readonly variant?: ToastVariant
        readonly duration?: number
      }): void
    }
    readonly router: {
      current(): Route
    }
  }
}
