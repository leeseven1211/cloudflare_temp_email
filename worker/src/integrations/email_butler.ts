import { Hono } from 'hono'
import { Jwt } from 'hono/utils/jwt'

const COMPAT_CLIENT = 'email-butler'
const DEFAULT_LIMIT = 100
const MAX_LIMIT = 100

const parseNonNegativeInt = (value: string | undefined, fallback: number): number | null => {
    if (value === undefined || value === '') return fallback
    if (!/^\d+$/.test(value)) return null
    const parsed = Number.parseInt(value, 10)
    return Number.isSafeInteger(parsed) ? parsed : null
}

const normalizeDomain = (value: string | undefined): string => (
    String(value || '').trim().toLowerCase().replace(/^@+/, '')
)

export const api = new Hono<HonoCustomType>()

api.get('/api/integrations/email-butler/addresses', async (c) => {
    if (c.req.header('x-temp-mail-compat-client') !== COMPAT_CLIENT) {
        return c.text('Unauthorized', 401)
    }

    const limit = parseNonNegativeInt(c.req.query('limit'), DEFAULT_LIMIT)
    const offset = parseNonNegativeInt(c.req.query('offset'), 0)
    if (limit === null || limit < 1 || limit > MAX_LIMIT) {
        return c.json({ error: 'limit must be between 1 and 100' }, 400)
    }
    if (offset === null) {
        return c.json({ error: 'offset must be a non-negative integer' }, 400)
    }

    const domain = normalizeDomain(c.req.query('domain'))
    const where = domain
        ? ' WHERE lower(name) LIKE ? OR lower(name) LIKE ?'
        : ''
    const params = domain
        ? ['%@' + domain, '%.' + domain]
        : []
    const page = await c.env.DB.prepare(
        'SELECT id, name, created_at, updated_at FROM address'
        + where
        + ' ORDER BY id ASC LIMIT ? OFFSET ?'
    ).bind(...params, limit, offset).all<{
        id: number,
        name: string,
        created_at: string | null,
        updated_at: string | null,
    }>()
    const count = await c.env.DB.prepare(
        'SELECT count(*) as count FROM address' + where
    ).bind(...params).first<number>('count') || 0

    const results = []
    for (const row of page.results) {
        results.push({
            id: row.id,
            address: row.name,
            jwt: await Jwt.sign({
                address: row.name,
                address_id: row.id,
            }, c.env.JWT_SECRET, 'HS256'),
            created_at: row.created_at,
            updated_at: row.updated_at,
        })
    }
    return c.json({ results, count, limit, offset })
})
