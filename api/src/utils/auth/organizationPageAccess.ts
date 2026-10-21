import run from '#db'

const HANASAND_ORGANIZATION_ID = '3e735e7b-4d7f-444d-9806-231fa26cfcec'
const EDIT_ROLES = new Set(['owner', 'admin', 'editor'])

export async function hasHanasandInternalPageAccess(userId: string) {
    const result = await run(`
        SELECT organization.id AS organization_id,
               organization.status AS organization_status,
               member.status AS membership_status,
               member.role
        FROM organization_members member
        JOIN organizations organization ON organization.id = member.organization_id
        JOIN users ON users.id = member.user_id
        WHERE member.user_id = $1
          AND organization.id = $2
          AND users.active IS TRUE
          AND users.deletion_scheduled_at IS NULL
        LIMIT 1
    `, [userId, HANASAND_ORGANIZATION_ID])

    const membership = result.rows[0] as {
        organization_id?: string
        organization_status?: string
        membership_status?: string
        role?: string
    } | undefined
    return membership?.organization_id === HANASAND_ORGANIZATION_ID
        && membership.organization_status === 'active'
        && membership.membership_status === 'active'
        && EDIT_ROLES.has((membership.role || '').toLowerCase())
}
