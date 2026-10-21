import { Pool } from 'pg'

let pool: Pool | undefined

function databasePool() {
    if (pool) return pool
    const connectionString = process.env.DATABASE_URL
    const connection = connectionString
        ? { connectionString }
        : {
            host: process.env.PGHOST,
            port: Number(process.env.PGPORT || 5432),
            user: process.env.PGUSER,
            password: process.env.PGPASSWORD,
            database: process.env.PGDATABASE,
        }
    if (!connectionString && (!connection.host || !connection.user || !connection.password || !connection.database)) {
        throw new Error('DATABASE_URL or PGHOST, PGUSER, PGPASSWORD, and PGDATABASE are required.')
    }
    pool = new Pool({
        ...connection,
        max: Number(process.env.DB_MAX_CONN || 12),
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 30_000,
        statement_timeout: 10_000,
    })
    return pool
}

export default function run(sql: string, values: unknown[] = []) {
    return databasePool().query<any>(sql, values)
}

export const queryOnce = run

export async function withDatabaseRetryBudget<T>(timeoutMs: number, work: () => Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([
            work(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Mail database request timed out.')), timeoutMs)
            }),
        ])
    } finally {
        if (timer) clearTimeout(timer)
    }
}

export async function closeDatabase() {
    await pool?.end()
}
