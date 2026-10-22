import { describe, expect, it } from 'bun:test'
import { isVirusTotalClear } from '#utils/mail/urlReputation.ts'

describe('VirusTotal attachment release policy', () => {
    it('releases only a known report with zero flagged scanners', () => {
        expect(isVirusTotalClear({ provider: 'virustotal', status: 'known', flagged: 0, total: 90 })).toBe(true)
        expect(isVirusTotalClear({ provider: 'virustotal', status: 'known', flagged: 1, total: 90 })).toBe(false)
        expect(isVirusTotalClear({ provider: 'virustotal', status: 'known', total: 90 })).toBe(false)
        expect(isVirusTotalClear({ provider: 'virustotal', status: 'unknown' })).toBe(false)
        expect(isVirusTotalClear({ provider: 'virustotal', status: 'unavailable' })).toBe(false)
    })
})
