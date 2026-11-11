const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}
function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}
function serviceKey(): string {
  const direct = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();
  if (direct) return direct;
  const singular = Deno.env.get('SUPABASE_SECRET_KEY')?.trim();
  if (singular) return singular;
  const keySet = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (keySet) {
    const keys = JSON.parse(keySet) as Record<string, string>;
    const key = keys.default ?? Object.values(keys).find(Boolean);
    if (key) return key;
  }
  throw new Error('Missing Supabase server secret key.');
}
function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
async function decryptRefreshToken(encrypted: string): Promise<string> {
  const rawKey = fromB64(requiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY'));
  if (rawKey.length !== 32) throw new Error('Invalid Google token encryption key.');
  const combined = fromB64(encrypted);
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(plain);
}
async function api(path: string, key: string, init: RequestInit = {}, userToken?: string): Promise<Response> {
  const base = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${userToken ?? key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'Authentication required.' }, 401);

  try {
    const key = serviceKey();
    const authResponse = await api('/auth/v1/user', key, { method: 'GET' }, token);
    const currentUser = await authResponse.json().catch(() => ({})) as { id?: string };
    if (!authResponse.ok || !currentUser.id) return json({ error: 'Your session is invalid or expired.' }, 401);

    let requestId = '';
    try { requestId = String(((await request.json()) as { requestId?: unknown }).requestId ?? ''); }
    catch { return json({ error: 'A valid exchange request is required.' }, 400); }
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
      return json({ error: 'A valid exchange request is required.' }, 400);
    }

    const claimResponse = await api('/rest/v1/rpc/claim_google_meet_space', key, {
      method: 'POST', body: JSON.stringify({ p_request_id: requestId })
    }, token);
    const claim = await claimResponse.json().catch(() => ({})) as { status?: string; provider_id?: string; meeting_url?: string; space_name?: string };
    if (!claimResponse.ok) return json({ error: await errorBodyFrom(claimResponse) }, 409);

    let meetingUrl = claim.meeting_url;
    let spaceName = claim.space_name;
    if (claim.status === 'creating') {
      const providerId = claim.provider_id;
      if (!providerId) return json({ error: 'The skill provider was not found.' }, 500);
      const connectionResponse = await api(
        `/rest/v1/google_meet_connections?select=encrypted_refresh_token&user_id=eq.${encodeURIComponent(providerId)}&limit=1`, key
      );
      const connections = await connectionResponse.json().catch(() => []) as { encrypted_refresh_token: string }[];
      if (!connectionResponse.ok || !connections[0]) {
        await markFailed(key, requestId);
        return json({ error: 'The skill provider must connect Google Meet from their profile before accepting this request.' }, 409);
      }

      const refreshToken = await decryptRefreshToken(connections[0].encrypted_refresh_token);
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
          client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        })
      });
      const refreshed = await tokenResponse.json().catch(() => ({})) as { access_token?: string; error?: string };
      if (!tokenResponse.ok || !refreshed.access_token) {
        await markFailed(key, requestId);
        if (refreshed.error === 'invalid_grant') {
          return json({ error: 'The provider’s Google Meet connection expired. They must reconnect Google Meet from their profile.' }, 409);
        }
        return json({ error: 'Google could not authorize creation of the meeting. Try again later.' }, 502);
      }

      // The API call uses the provider's Google refresh token. That account owns
      // and moderates the space; the requester is never granted COHOST access.
      const spaceResponse = await fetch('https://meet.googleapis.com/v2/spaces', {
        method: 'POST',
        headers: { Authorization: `Bearer ${refreshed.access_token}`, 'Content-Type': 'application/json' },
        // accessType is omitted because some Google accounts (including consumer
        // accounts) cannot set it through the API. Meet applies the provider's
        // own default access policy; moderation remains enabled when supported.
        body: JSON.stringify({ config: { moderation: 'ON' } })
      });
      const space = await spaceResponse.json().catch(() => ({})) as {
        name?: string;
        meetingUri?: string;
        error?: {
          code?: number;
          status?: string;
          message?: string;
          details?: Array<{ reason?: string; domain?: string; metadata?: Record<string, unknown> }>;
        };
      };
      if (!spaceResponse.ok || !space.name || !space.meetingUri?.startsWith('https://meet.google.com/')) {
        await markFailed(key, requestId);
        const reasons = (space.error?.details ?? [])
          .map(detail => detail.reason)
          .filter((reason): reason is string => Boolean(reason));
        const diagnostic = {
          httpStatus: spaceResponse.status,
          googleStatus: space.error?.status ?? null,
          googleCode: space.error?.code ?? null,
          message: space.error?.message ?? 'Google returned no error description.',
          reasons: [...new Set(reasons)]
        };
        console.error('Google Meet space creation failed:', JSON.stringify(diagnostic));
        return json({
          error: 'Google rejected the meeting creation request.',
          code: 'google_meet_api_error',
          diagnostic
        }, 502);
      }
      meetingUrl = space.meetingUri;
      spaceName = space.name;

      const saveSpace = await api('/rest/v1/google_meet_spaces?on_conflict=request_id', key, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ request_id: requestId, provider_id: providerId, space_name: spaceName, meeting_url: meetingUrl, status: 'ready', updated_at: new Date().toISOString() })
      });
      if (!saveSpace.ok) {
        console.error('Could not save Google Meet space:', saveSpace.status);
        return json({ error: 'Google Meet was created but could not be linked to the request. Retry acceptance to reconcile it.' }, 502);
      }
    }

    if (claim.status !== 'ready' && claim.status !== 'creating') return json({ error: 'Google Meet space is not ready.' }, 409);
    if (!meetingUrl) return json({ error: 'Google Meet did not return a valid meeting link.' }, 502);

    const acceptResponse = await api('/rest/v1/rpc/respond_to_session_request', key, {
      method: 'POST',
      body: JSON.stringify({ p_request_id: requestId, p_action: 'accept', p_new_start_at: null, p_meeting_url: meetingUrl })
    }, token);
    const sessionId = await acceptResponse.json().catch(() => null) as string | null;
    if (!acceptResponse.ok || !sessionId) {
      return json({ error: acceptResponse.ok ? 'The request expired or could not be accepted.' : await errorBodyFrom(acceptResponse) }, 409);
    }
    return json({ success: true, sessionId });
  } catch (error) {
    console.error('Google Meet session creation failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Google Meet could not be prepared. Check the integration configuration and try again.' }, 500);
  }
});

async function errorBodyFrom(response: Response): Promise<string> {
  const payload = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
  return String(payload.message ?? payload.msg ?? payload.error_description ?? payload.error ?? 'The request could not be completed.');
}

async function markFailed(key: string, requestId: string): Promise<void> {
  await api(`/rest/v1/google_meet_spaces?request_id=eq.${encodeURIComponent(requestId)}`, key, {
    method: 'PATCH', body: JSON.stringify({ status: 'failed', updated_at: new Date().toISOString() })
  });
}
