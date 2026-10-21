import { assertRuntimeConfig, createServer } from './server.ts'

assertRuntimeConfig()
const app = await createServer()
const port = Number(process.env.PORT || 8081)
await app.listen({ host: '0.0.0.0', port })

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
        void app.close().finally(() => process.exit(0))
    })
}
