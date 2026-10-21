export type { AdminPatch, PrincipalRecord } from './stalwartAdminTypes.ts'

export {
    createPrincipal,
    deleteMailPrincipal,
    findPrincipalByName,
    listPrincipals,
    patchPrincipal,
    setDomainCatchAllAddress,
} from './stalwartPrincipalAdmin.ts'

export { ensureSetting, fetchRecommendedDns } from './stalwartSettingsAdmin.ts'
export { fetchMailQueueSummary } from './stalwartQueueAdmin.ts'
