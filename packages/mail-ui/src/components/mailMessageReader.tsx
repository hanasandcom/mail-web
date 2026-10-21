'use client'

import type { RefObject } from 'react'
import { Archive, ArrowLeft, CornerUpLeft, Forward, Inbox, Reply, ShieldAlert, Star, Trash2 } from 'lucide-react'
import type { MailMessage, MailOverview } from '../types'
import DmarcReportPreview, { reportAttachments } from './dmarcReport'
import { ActionIconButton, AttachmentPreview, formatDate, formatMailboxAddress, toolbarButton } from './utils'
import { useMailMessageContent } from './useMailMessageContent'

type MessageContent = ReturnType<typeof useMailMessageContent>
type Action = 'archive' | 'trash' | 'read' | 'unread' | 'flag' | 'unflag' | 'junk' | 'ham' | 'restore'
type Props = {
    readingMessage: boolean
    reader: RefObject<HTMLElement | null>
    overview: MailOverview | null
    selectedMailboxId: string | null
    loading: boolean
    theme: 'light' | 'dark'
    selectedMessage: MailMessage | null
    content: MessageContent
    onBack: () => void
    onReply: (action: 'reply' | 'replyAll' | 'forward') => void
    onAction: (messageId: string, action: Action) => void
}

export function MailMessageReader({ readingMessage, reader, overview, selectedMailboxId, loading, theme, selectedMessage, content, onBack, onReply, onAction }: Props) {
    return (
        <>
        {readingMessage && (
<section ref={reader} data-mail-message-reader className='rounded-lg border border-ui-border bg-ui-panel shadow-sm shadow-ui-canvas/10 dark:shadow-ui-canvas/20 min-w-0 p-3 @3xl:flex @3xl:min-h-0 @3xl:flex-col @3xl:overflow-y-auto'>
                    <button type='button' className={`${toolbarButton} mb-2 shrink-0 self-start`} onClick={() => onBack()}><ArrowLeft className='h-4 w-4' />Back to {overview?.mailboxes.find(mailbox => mailbox.id === selectedMailboxId)?.name || 'inbox'}</button>
                    {loading && <div role='status' className='px-2 py-6 text-xs text-ui-muted'>Loading message…</div>}
                    {!loading && !selectedMessage && <div className='rounded-lg border border-dashed border-ui-border px-4 py-8 text-xs text-ui-muted'>This message is unavailable. Return to the list or try opening it again.</div>}
                    {selectedMessage && overview && (
                        <div className='flex min-h-0 flex-1 flex-col gap-2'>
                            <div className='flex flex-wrap items-center justify-between gap-2 border-b border-ui-border pb-3'>
                                <div className='min-w-0'>
                                    <h2 className='truncate text-lg font-semibold tracking-[-0.03em] text-ui-text'>{selectedMessage.subject}</h2>
                                    <div className='mt-1 grid gap-0.5 text-[11px] text-ui-muted'>
                                        <p>From {selectedMessage.from.map(formatMailboxAddress).join(', ')}</p>
                                        <p>To {selectedMessage.to.map(formatMailboxAddress).join(', ')}</p>
                                        {!!selectedMessage.cc.length && <p>CC {selectedMessage.cc.map(formatMailboxAddress).join(', ')}</p>}
                                        <p>{formatDate(selectedMessage.receivedAt, true)}</p>
                                    </div>
                                </div>

                                <div className='flex flex-wrap items-center gap-1.5'>
                                    <ActionIconButton label='Reply' disabled={loading || overview?.actor.canSend === false} icon={<Reply className='h-3.5 w-3.5' />} onClick={() => onReply('reply')} />
                                    <ActionIconButton label='Reply all' disabled={loading || overview?.actor.canSend === false} icon={<CornerUpLeft className='h-3.5 w-3.5' />} onClick={() => onReply('replyAll')} />
                                    <ActionIconButton label='Forward' disabled={loading || overview?.actor.canSend === false} icon={<Forward className='h-3.5 w-3.5' />} onClick={() => onReply('forward')} />
                                    <ActionIconButton label={selectedMessage.isFlagged ? 'Unstar' : 'Star'} icon={<Star className='h-3.5 w-3.5' />} onClick={() => onAction(selectedMessage.id, selectedMessage.isFlagged ? 'unflag' : 'flag')} />
                                    <ActionIconButton label='Archive' icon={<Archive className='h-3.5 w-3.5' />} onClick={() => onAction(selectedMessage.id, 'archive')} />
                                    <ActionIconButton
                                        label={selectedMessage.isJunk ? 'Not spam' : 'Spam'}
                                        icon={selectedMessage.isJunk ? <Inbox className='h-3.5 w-3.5' /> : <ShieldAlert className='h-3.5 w-3.5' />}
                                        onClick={() => onAction(selectedMessage.id, selectedMessage.isJunk ? 'ham' : 'junk')}
                                    />
                                    <ActionIconButton label='Trash' icon={<Trash2 className='h-3.5 w-3.5' />} onClick={() => onAction(selectedMessage.id, 'trash')} />
                                </div>
                            </div>

                            {!!selectedMessage.attachments.length && (
                                <div className='rounded-lg border border-ui-border bg-ui-raised p-3'>
                                    <div className='mb-2 text-[11px] font-medium tracking-normal text-ui-muted'>Attachments</div>
                                    <div className='grid gap-2 lg:grid-cols-2'>
                                        {selectedMessage.attachments.map(attachment => (
                                            <div key={attachment.blobId}>
                                                <AttachmentPreview
                                                    attachment={attachment}
                                                    mailboxUser={overview.mailboxUser}
                                                    reputation={content.currentAttachmentReputations.get(attachment.blobId)}
                                                    checking={content.remoteContentPending}
                                                />
                                                <p className='mt-1 flex flex-wrap items-center gap-1 px-1 text-[10px] text-ui-muted' role='status'>
                                                    {content.remoteContentPending ? 'Checking VirusTotal by file hash…' : content.remoteContentError ? 'VirusTotal status unavailable.' : (() => {
                                                        const reputation = content.currentAttachmentReputations.get(attachment.blobId)
                                                        if (!reputation || reputation.status === 'unavailable') return 'VirusTotal status unavailable.'
                                                        if (reputation.status === 'unknown') return 'No VirusTotal report for this file hash.'
                                                        return <>
                                                            <span className={reputation.flagged ? 'text-ui-danger' : ''}>{reputation.flagged ? `Potential threat: ${reputation.flagged} / ${reputation.total ?? '?'} scanners flagged` : `VirusTotal: 0 / ${reputation.total ?? '?'} scanners flagged`}</span>
                                                            {reputation.reportUrl && <a href={reputation.reportUrl} target='_blank' rel='noopener noreferrer' className='underline'>Report</a>}
                                                        </>
                                                    })()}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {reportAttachments(selectedMessage).map(attachment => <DmarcReportPreview key={`${overview.mailboxUser}:${selectedMessage.id}:${attachment.blobId}`} attachment={attachment} mailboxUser={overview.mailboxUser} reputation={content.currentAttachmentReputations.get(attachment.blobId)} checking={content.remoteContentPending} />)}

                            {selectedMessage.htmlBody ? (
                                <>
                                {(content.remoteContentPending || content.remoteContentError || content.currentRemoteUrls.length > 0) && <div className='flex flex-wrap items-center gap-2 rounded-lg border border-ui-border bg-ui-raised px-3 py-2 text-[11px] text-ui-muted'>
                                    {content.remoteContentPending ? <span role='status'>Checking remote image safety…</span> : content.remoteContentError ? <span role='status'>{content.remoteContentError}</span> : <>
                                        <span>{content.currentRemoteHtml ? 'Safe remote images are loaded.' : `Remote images are blocked by default. ${content.safeRemoteImageUrls.length} safe image${content.safeRemoteImageUrls.length === 1 ? '' : 's'} available.`}</span>
                                        {content.safeRemoteImageUrls.length > 0 && <button type='button' className='rounded-md border border-ui-border px-2 py-1 text-ui-text hover:bg-ui-panel' onClick={() => {
                                            if (content.currentRemoteHtml) {
                                                content.setRemoteHtmlOverride(null)
                                                return
                                            }
                                            content.setRemoteHtmlOverride(content.withApprovedRemoteImages())
                                        }}>{content.currentRemoteHtml ? 'Hide remote images' : 'Load safe remote images'}</button>}
                                        {!content.currentRemoteHtml && content.safeRemoteImageUrls.length > 0 && <span>Loading requests these images from their external hosts and may reveal your IP address.</span>}
                                    </>}
                                </div>}
                                <iframe
                                    title='HTML mail'
                                    style={{ colorScheme: theme, background: 'transparent' }}
                                    className='h-72 w-full shrink-0 rounded-lg border border-ui-border @3xl:min-h-40 @3xl:flex-1'
                                    sandbox='allow-popups allow-popups-to-escape-sandbox'
                                    srcDoc={content.renderedHtml}
                                />
                                </>
                            ) : selectedMessage.textBody ? (
                                <article className='min-w-0 wrap-anywhere rounded-lg border border-ui-border px-4 py-3 @3xl:min-h-40 @3xl:flex-1 @3xl:overflow-y-auto text-xs leading-5 whitespace-pre-wrap text-ui-text'>
                                    {selectedMessage.textBody}
                                </article>
                            ) : null}
                        </div>
                    )}
                </section>
        )}
        </>
    )
}
