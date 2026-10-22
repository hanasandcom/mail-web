import { expect, test } from 'bun:test'
import { withDeadline } from '../src/handlers/mail/getOverview.ts'

test('mail overview deadline aborts the underlying JMAP work before returning its fallback', async () => {
    const controller = new AbortController()
    const result = await withDeadline(
        new Promise<string>(() => {}),
        1,
        'degraded overview',
        () => controller.abort(new Error('Mail overview deadline exceeded.')),
    )

    expect(result).toBe('degraded overview')
    expect(controller.signal.aborted).toBe(true)
})
