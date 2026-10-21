import { expect, test } from '@playwright/test'

test('mailbox selector keeps its chevron and menu in bounds and supports keyboard selection', async ({ page, context, baseURL }) => {
    test.skip(!/localhost|127\.0\.0\.1/.test(baseURL || ''), 'Uses loopback-only render-proof auth')
    await page.setViewportSize({ width: 390, height: 844 })
    await context.setExtraHTTPHeaders({ 'x-hanasand-render-proof-auth': 'local-dashboard-render-proof' })
    await context.addCookies([
        { name: 'id', value: 'dashboard-render-proof-user', url: baseURL! },
        { name: 'access_token', value: 'local-dashboard-render-proof-token', url: baseURL! },
    ])

    const accountChanges: string[] = []
    const testOrigin = new URL(baseURL!).origin
    await page.route('**/overview**', route => {
        if (route.request().method() === 'OPTIONS') {
            return route.fulfill({ status: 204, headers: {
                'Access-Control-Allow-Origin': testOrigin,
                'Access-Control-Allow-Credentials': 'true',
                'Access-Control-Allow-Headers': 'authorization,content-type,id,x-hanasand-render-proof-auth',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
            } })
        }
        const url = new URL(route.request().url())
        const mailboxUser = url.searchParams.get('mailboxUser') || 'dashboard-render-proof-user'
        if (url.searchParams.has('mailboxUser')) accountChanges.push(mailboxUser)
        return route.fulfill({ headers: { 'Access-Control-Allow-Origin': testOrigin, 'Access-Control-Allow-Credentials': 'true' }, json: {
            actor: { id: 'dashboard-render-proof-user', canSend: true },
            mailboxUser,
            mailboxAddress: mailboxUser === 'second' ? 'second@example.test' : 'user@example.test',
            accessibleAccounts: [
                { id: 'dashboard-render-proof-user', name: 'Test', address: 'user@example.test' },
                { id: 'second', name: 'Second account', address: 'second@example.test' },
            ],
            mailboxes: [{ id: 'inbox', name: 'Inbox', role: 'inbox' }],
            selectedMailboxId: 'inbox',
            messages: [],
            nextCursor: null,
            selectedMessage: null,
        } })
    })

    await page.goto('/')
    const selector = page.getByRole('combobox', { name: 'Mail account' })
    await expect(selector).toBeVisible()
    const triggerPadding = await selector.evaluate(element => {
        const style = getComputedStyle(element)
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
    expect(new Set(triggerPadding).size).toBe(1)
    await expect(selector).toHaveClass(/rounded-xl/)

    await selector.focus()
    await selector.press('ArrowDown')
    const listbox = page.getByRole('listbox', { name: 'Mail account' })
    await expect(listbox).toBeVisible()
    const option = listbox.getByRole('option').first()
    const optionBox = await option.boundingBox()
    const optionPadding = await option.evaluate(element => {
        const style = getComputedStyle(element)
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
    expect(new Set(optionPadding).size).toBe(1)
    expect(optionBox?.height).toBeGreaterThanOrEqual(44)
    const geometry = await selector.evaluate(element => {
        const button = element.getBoundingClientRect()
        const arrow = element.querySelector('svg')!.getBoundingClientRect()
        const menu = document.getElementById(element.getAttribute('aria-controls')!)!.getBoundingClientRect()
        return { buttonRight: button.right, arrowRight: arrow.right, menuLeft: menu.left, menuRight: menu.right, viewport: innerWidth }
    })
    expect(geometry.arrowRight).toBeLessThanOrEqual(geometry.buttonRight - 1)
    expect(geometry.menuLeft).toBeGreaterThanOrEqual(0)
    expect(geometry.menuRight).toBeLessThanOrEqual(geometry.viewport)

    const folderSelector = page.getByRole('combobox', { name: 'Mail folder' })
    const folderPadding = await folderSelector.evaluate(element => {
        const style = getComputedStyle(element)
        return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
    expect(new Set(folderPadding).size).toBe(1)
    const folderArrowRight = await folderSelector.evaluate(element => element.querySelector('svg')!.getBoundingClientRect().right)
    const folderButtonRight = await folderSelector.evaluate(element => element.getBoundingClientRect().right)
    expect(folderArrowRight).toBeLessThanOrEqual(folderButtonRight - 1)
    await folderSelector.focus()
    await folderSelector.press('ArrowDown')
    const folderMenu = page.getByRole('listbox', { name: 'Mail folder' })
    await expect(folderMenu).toBeVisible()
    const folderMenuBounds = await folderMenu.boundingBox()
    expect(folderMenuBounds?.x).toBeGreaterThanOrEqual(0)
    expect((folderMenuBounds?.x || 0) + (folderMenuBounds?.width || 0)).toBeLessThanOrEqual(390)

    await selector.press('ArrowDown')
    await selector.press('ArrowDown')
    await selector.press('Enter')
    await expect(selector).toContainText('Second account')
    await expect.poll(() => accountChanges).toContain('second')
})
