export type AdminPatch =
    | { action: 'set', field: string, value: unknown }
    | { action: 'addItem', field: string, value: unknown }
    | { action: 'removeItem', field: string, value: unknown }

export type PrincipalRecord = {
    id: number | string
    name: string
    type: string
    description?: string
    emails?: string[]
    secrets?: string[]
    roles?: string[]
    domainId?: string
    catchAllAddress?: string
    raw?: Record<string, unknown>
}

export type JmapSession = { apiUrl?: string }

export type JmapResponse<T = unknown> = {
    methodResponses?: Array<[string, T, string]>
}
