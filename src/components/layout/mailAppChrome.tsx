import { cookies } from 'next/headers'
import type { LucideIcon } from 'lucide-react'
import { Header } from 'hanasand'
import {
    Activity, AlarmClockCheck, BookOpen, ChevronDown, Code2, FileJson, FolderKanban,
    Gauge, House, ListFilter, Mail, Menu, Network, Radar, Search, Server, ShieldAlert,
    ShieldCheck, UserRound,
} from 'lucide-react'
import MailThemeToggle from './mailThemeToggle'
import MailSidebarShell from './mailSidebarShell'

const mainSite = 'https://hanasand.com'

function navigationHref(path: string) {
    return path === '/mail' ? '/' : `${mainSite}${path}`
}

type NavLink = [label: string, href: string]
type SidebarSection = {
    label: string
    icon: LucideIcon
    groups?: [label: string, links: NavLink[]][]
    links?: NavLink[]
}

const topNavigation: { label: string, items: [label: string, href: string, icon: LucideIcon][] }[] = [
    { label: 'Product', items: [
        ['Dark Web Monitoring', '/findings', Activity],
        ['Security Monitoring', '/solutions/security-monitoring', ShieldAlert],
        ['Security Scanner', '/solutions/scanner', ShieldCheck],
        ['Threat Search', '/ti', Radar],
        ['Sandbox', '/sandbox', Network],
        ['Organizations', '/organizations', FolderKanban],
    ] },
    { label: 'Developers', items: [
        ['API overview', '/developers', Code2],
        ['API keys and onboarding', '/developers#api-access', ShieldCheck],
        ['API reference', '/developers#endpoints', BookOpen],
        ['TypeScript client', '/developers#clients', Code2],
        ['OpenAPI JSON', '/api/openapi', FileJson],
    ] },
    { label: 'Resources', items: [
        ['Status', '/status', Activity],
        ['Service Checks', '/status/checks', Gauge],
        ['Hash lookup', '/hash', Search],
        ['About Hanasand', '/about', House],
    ] },
]

const sidebar: SidebarSection[] = [
    { label: 'Security & intelligence', icon: ShieldCheck, groups: [
        ['Investigations', [['Cases', '/cases'], ['Threat Search', '/ti'], ['Sandbox', '/sandbox']]],
        ['Intelligence', [['Latest Activity', '/ti/activity'], ['Actors', '/findings/actors'], ['Actor Profiles', '/ti/profiles']]],
        ['Monitoring', [['Watchlists', '/watchlists'], ['Findings', '/findings'], ['Delivery', '/findings/actions']]],
        ['Collection', [['Feeds', '/ti/sources'], ['Collection', '/ti/runs'], ['Delivery Health', '/ti/timeliness']]],
        ['Security tools', [['Security Scanner', '/scanner'], ['Exposure Lookup', '/pwned'], ['Endpoint Checks', '/test']]],
    ] },
    { label: 'Logs & rules', icon: ListFilter, groups: [
        ['Logs', [['Log Dashboard', '/logs'], ['Realtime', '/logs/realtime'], ['Search', '/logs/search'], ['Errors', '/logs/errors']]],
        ['Traffic', [['Overview', '/traffic'], ['Recent traffic', '/traffic/recent'], ['Live map', '/traffic/map'], ['Blocklist', '/traffic/blocklist']]],
        ['Rules', [['Match Rules', '/rules/match'], ['Analysis Rules', '/rules/analysis'], ['Detection Rules', '/rules/detection'], ['Tuning', '/rules/tuning']]],
    ] },
    { label: 'Infrastructure', icon: Server, groups: [
        ['System', [['Overview', '/system'], ['Virtual machines', '/system/virtual-machines'], ['Containers', '/system/containers'], ['Hosts', '/system/hosts']]],
        ['Compute', [['Virtual Machines', '/vms'], ['Host Updates', '/system/updates']]],
        ['Health', [['AI Metrics', '/system/ai'], ['Vulnerabilities', '/vulnerabilities'], ['Rate Limits', '/system/rates'], ['Load Testing', '/load-testing']]],
        ['Data management', [['Database', '/db'], ['Backups', '/db/backups']]],
    ] },
    { label: 'Automation', icon: AlarmClockCheck, links: [['Health Checks', '/automation/health'], ['Cron Jobs', '/automation/cron']] },
    { label: 'Content', icon: BookOpen, groups: [
        ['Writing', [['Notes', '/notes'], ['Articles', '/content/articles'], ['Thoughts', '/content/thoughts']]],
        ['Media', [['Gallery', '/gallery'], ['Uploads', '/upload']]],
        ['Code', [['Projects', '/projects'], ['Shares', '/shares']]],
        ['Thesis', [['Overview', '/thesis']]],
    ] },
    { label: 'Communication', icon: Mail, links: [['Mail', '/mail'], ['Support Chats', '/support']] },
    { label: 'Organization', icon: FolderKanban, groups: [
        ['Overview', [['Organizations', '/organizations']]],
        ['Settings & billing', [['Organization Settings', '/organizations/settings'], ['Privacy & Retention', '/organizations/privacy'], ['Subscription', '/subscription']]],
        ['Access & credentials', [['Team', '/organizations/team'], ['API Keys', '/organizations/api-keys'], ['Service Accounts', '/management/service-accounts']]],
        ['Integrations', [['Integrations', '/findings/delivery']]],
        ['Monitoring & activity', [['Events & Cases', '/organizations/events'], ['Activity', '/organizations/activity']]],
    ] },
    { label: 'Administration', icon: ShieldAlert, links: [['Organizations', '/management/organizations'], ['Users', '/management/users'], ['Audit Log', '/management/audit']] },
    { label: 'Resources', icon: Code2, links: [['API Docs', '/api'], ['OpenAPI JSON', '/api/openapi']] },
]

export default async function MailAppChrome({ children }: { children: React.ReactNode }) {
    const cookieStore = await cookies()
    const userId = cookieStore.get('id')?.value || ''

    return <div className='enterprise-theme flex h-dvh min-h-0 flex-col overflow-hidden bg-ui-canvas text-ui-text'>
        <div data-site-header className='site-chrome z-20 shrink-0 border-b border-ui-border bg-ui-panel px-3 text-ui-text sm:px-5 md:px-10 lg:px-16'>
            <Header
                brandHref={`${mainSite}/dashboard`}
                brandLabel='Hanasand Mail'
                logoSrc='/hanasand-logo-transparent.png'
                links={[{ href: 'https://cdn.hanasand.com', label: 'CDN' }]}
                className='mx-auto flex h-18 w-full max-w-7xl items-center justify-between gap-2 sm:gap-5'
                actions={<div className='flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2'>
                <nav aria-label='Main navigation' className='mr-auto hidden items-center gap-2 xl:flex'>
                    {topNavigation.map(group => <details key={group.label} className='group relative'>
                        <summary className='flex h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-3 text-sm font-semibold text-ui-muted transition hover:bg-ui-raised hover:text-ui-text [&::-webkit-details-marker]:hidden'>
                            {group.label}<ChevronDown className='h-4 w-4 transition group-open:rotate-180' />
                        </summary>
                        <div className='absolute left-0 top-12 z-30 grid w-80 gap-1 rounded-lg border border-ui-border bg-ui-panel p-2 shadow-xl'>
                            {group.items.map(([label, href, Icon]) => <a key={href} href={`${mainSite}${href}`} className='flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ui-text transition hover:bg-ui-raised'>
                                <Icon className='h-4 w-4 shrink-0 text-ui-muted' />{label}
                            </a>)}
                        </div>
                    </details>)}
                    <a href={`${mainSite}/pricing`} className='inline-flex h-10 min-w-20 items-center justify-center rounded-lg px-3 text-sm font-semibold text-ui-muted transition hover:bg-ui-raised hover:text-ui-text'>Pricing</a>
                </nav>
                <div className='flex min-w-0 flex-1 items-center justify-end gap-1 sm:gap-2'>
                    <a href={`${mainSite}/dashboard`} aria-label='Search Hanasand' className='hidden h-10 min-w-36 items-center gap-2 rounded-lg border border-ui-border px-3 text-sm font-semibold text-ui-muted transition hover:bg-ui-raised hover:text-ui-text md:inline-flex'>
                        <Search className='h-4 w-4' />Search <kbd className='ml-auto rounded border border-ui-border px-1.5 py-0.5 text-[10px]'>Cmd K</kbd>
                    </a>
                    <a href={`${mainSite}/support`} className='hidden h-10 min-w-20 items-center justify-center rounded-lg px-3 text-sm font-semibold text-ui-muted transition hover:bg-ui-raised hover:text-ui-text lg:inline-flex'>Support</a>
                    <MailThemeToggle />
                    <a href={`${mainSite}/dashboard`} className='hidden h-11 items-center gap-2 rounded-lg bg-ui-text px-3 text-sm font-semibold text-ui-canvas shadow-sm transition hover:opacity-90 sm:inline-flex sm:px-4'>Dashboard</a>
                    <details className='relative'>
                        <summary aria-label='Account options' className='grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-ui-border text-ui-muted hover:bg-ui-raised hover:text-ui-text [&::-webkit-details-marker]:hidden'>
                            <UserRound className='h-5 w-5' />
                        </summary>
                        <div className='absolute right-0 top-12 z-30 grid w-60 gap-2 rounded-lg border border-ui-border bg-ui-panel p-3 text-sm text-ui-text shadow-xl'>
                            <p className='truncate px-2 py-1 font-mono text-xs text-ui-muted'>@{userId || 'account'}</p>
                            <div role='separator' className='border-t border-ui-border' />
                            <a href={`${mainSite}/profile/${encodeURIComponent(userId)}`} className='rounded-lg p-2 hover:bg-ui-raised'>Profile</a>
                            <a href={`${mainSite}/logout`} className='rounded-lg p-2 hover:bg-ui-raised'>Sign out</a>
                        </div>
                    </details>
                    <details className='relative xl:hidden'>
                        <summary aria-label='Open navigation' className='grid h-10 w-10 cursor-pointer list-none place-items-center rounded-lg border border-ui-border text-ui-muted hover:bg-ui-raised hover:text-ui-text [&::-webkit-details-marker]:hidden'><Menu className='h-4 w-4' /></summary>
                        <div className='absolute right-0 top-12 z-30 max-h-[calc(100dvh-6rem)] w-72 overflow-y-auto rounded-lg border border-ui-border bg-ui-panel p-2 shadow-xl'>
                            {topNavigation.map(group => <details key={group.label} className='group'>
                                <summary className='flex min-h-11 cursor-pointer list-none items-center justify-between rounded-lg px-3 text-sm font-semibold hover:bg-ui-raised [&::-webkit-details-marker]:hidden'>{group.label}<ChevronDown className='h-4 w-4 transition group-open:rotate-180' /></summary>
                                {group.items.map(([label, href]) => <a key={href} href={`${mainSite}${href}`} className='block rounded-lg px-5 py-2 text-sm text-ui-text hover:bg-ui-raised'>{label}</a>)}
                            </details>)}
                            <a href={`${mainSite}/pricing`} className='block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-ui-raised'>Pricing</a>
                            <a href={`${mainSite}/support`} className='block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-ui-raised'>Support</a>
                        </div>
                    </details>
                </div>
                </div>}
            />
        </div>
        <div className='grid min-h-0 flex-1 grid-cols-1 gap-2 bg-ui-canvas p-2 lg:grid-cols-[auto_minmax(0,1fr)]'>
            <MailSidebarShell>
                    {sidebar.map(section => {
                        const Icon = section.icon
                        const active = section.label === 'Communication'
                        return <details key={section.label} data-sidebar-section open={active} className='group border-b border-ui-border/70 py-1 last:border-b-0'>
                            <summary className='flex min-h-10 cursor-pointer list-none items-center gap-2 rounded-lg px-2 text-sm font-bold text-ui-text hover:bg-ui-raised [&::-webkit-details-marker]:hidden'>
                                <Icon className='h-5 w-5 shrink-0 text-ui-text' /><span className='min-w-0 flex-1'>{section.label}</span><ChevronDown className='h-4 w-4 shrink-0 text-ui-muted transition group-open:rotate-180' />
                            </summary>
                            {section.groups?.map(([groupLabel, links]) => <details key={groupLabel} className='group/sub ml-2 border-l border-ui-border pl-2'>
                                <summary className='flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg px-2 text-sm font-semibold text-ui-text hover:bg-ui-raised [&::-webkit-details-marker]:hidden'>{groupLabel}<ChevronDown className='h-4 w-4 text-ui-muted transition group-open/sub:rotate-180' /></summary>
                                <div className='ml-2 grid border-l border-ui-border pl-2'>
                                    {links.map(([label, href]) => <a key={href} href={navigationHref(href)} aria-current={href === '/mail' ? 'page' : undefined} className={`flex min-h-10 items-center rounded-lg px-3 text-sm ${href === '/mail' ? 'bg-ui-raised font-semibold text-ui-text' : 'text-ui-muted hover:bg-ui-raised hover:text-ui-text'}`}>{label}</a>)}
                                </div>
                            </details>)}
                            {section.links && <div className='ml-2 grid border-l border-ui-border pl-2'>
                                {section.links.map(([label, href]) => <a key={href} href={navigationHref(href)} aria-current={href === '/mail' ? 'page' : undefined} className={`flex min-h-10 items-center rounded-lg px-3 text-sm ${href === '/mail' ? 'bg-ui-raised font-semibold text-ui-text' : 'text-ui-muted hover:bg-ui-raised hover:text-ui-text'}`}>{label}</a>)}
                            </div>}
                        </details>
                    })}
            </MailSidebarShell>
            <main className='min-h-0 min-w-0 overflow-y-auto overscroll-contain'>{children}</main>
        </div>
    </div>
}
