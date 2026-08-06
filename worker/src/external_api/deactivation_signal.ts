import { Hono } from 'hono';

import { commonParseMail } from '../common';

export const api = new Hono<HonoCustomType>();

type MailRow = {
    id?: number | string;
    message_id?: string;
    source?: string;
    address?: string;
    raw?: string;
    created_at?: string;
};

const normalize = (value: unknown): string => String(value || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const senderAddress = (value: unknown): string => {
    const raw = String(value || '').trim().toLowerCase();
    const angle = raw.match(/<([^<>\s]+@[^<>\s]+)>/);
    if (angle) return angle[1];
    const plain = raw.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+/i);
    return plain ? plain[0].toLowerCase() : '';
};

const isOfficialOpenAISender = (value: unknown): boolean => {
    const address = senderAddress(value);
    const domain = address.includes('@') ? address.split('@').pop() || '' : '';
    return domain === 'openai.com' || domain.endsWith('.openai.com');
};

export const classifyOpenAIDeactivation = (input: {
    sender?: unknown;
    subject?: unknown;
    text?: unknown;
    html?: unknown;
}): boolean => {
    if (!isOfficialOpenAISender(input.sender)) return false;
    const subject = normalize(input.subject);
    const content = normalize(`${String(input.subject || '')}\n${String(input.text || '')}\n${String(input.html || '')}`);
    const strongPhrases = [
        'deactivating your access to our services immediately',
        'your openai account has been deactivated',
        'your openai account was deactivated',
        'we have deactivated your openai account',
        'your access to openai has been deactivated',
    ];
    if (strongPhrases.some((phrase) => content.includes(phrase))) return true;

    const subjectSignal = subject.includes('openai')
        && ['deactivat', 'suspend', 'disabled'].some((word) => subject.includes(word));
    const violationSignal = content.includes('policy violation')
        || content.includes('as a result of these violations');
    const enforcementSignal = ['deactivat', 'suspend', 'disabled'].some((word) => content.includes(word));
    return subjectSignal && violationSignal && enforcementSignal && content.includes('appeal');
};

api.post('/external/api/signals/scan', async (c) => {
    let body: { email?: unknown; lookback_days?: unknown };
    try {
        body = await c.req.json();
    } catch {
        return c.json({ code: 400, error: 'invalid_json' }, 400);
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) {
        return c.json({ code: 400, error: 'invalid_email' }, 400);
    }
    const requestedLookback = Number.parseInt(String(body.lookback_days || '120'), 10);
    const lookbackDays = Math.max(1, Math.min(Number.isFinite(requestedLookback) ? requestedLookback : 120, 365));
    const sinceModifier = `-${lookbackDays} days`;

    const query = await c.env.DB.prepare(
        `SELECT id, message_id, source, address, raw, created_at
         FROM raw_mails
         WHERE lower(address) = ? AND created_at >= datetime('now', ?)
         ORDER BY created_at DESC
         LIMIT 500`
    ).bind(email, sinceModifier).all<MailRow>();

    let match: {
        message_id: string;
        received_at: string;
        subject: string;
        sender: string;
    } | null = null;

    for (const row of query.results || []) {
        if (String(row.address || '').trim().toLowerCase() !== email) continue;
        const parsed = await commonParseMail({ rawEmail: String(row.raw || '') });
        if (!parsed || !classifyOpenAIDeactivation(parsed)) continue;
        match = {
            message_id: String(row.message_id || row.id || '').slice(0, 300),
            received_at: String(row.created_at || '').slice(0, 64),
            subject: String(parsed.subject || '').slice(0, 300),
            sender: senderAddress(parsed.sender).slice(0, 200),
        };
        break;
    }

    return c.json({
        code: 200,
        ok: true,
        detected: Boolean(match),
        confidence: match ? 'high' : 'none',
        checked_at: new Date().toISOString(),
        received_at: match?.received_at || '',
        subject: match?.subject || '',
        sender: match?.sender || '',
        message_id: match?.message_id || '',
    });
});
