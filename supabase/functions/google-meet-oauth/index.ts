const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS'
};
const meetScope = 'https://www.googleapis.com/auth/meetings.space.created';
const openIdScopes = ['openid', 'email', meetScope];

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
function b64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function fromB64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}
function base64Url(bytes: Uint8Array): string {
  return b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
async function encryptRefreshToken(token: string): Promise<string> {
  const rawKey = fromB64(requiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY'));
  if (rawKey.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(token));
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  return b64(combined);
}
async function decryptRefreshToken(encrypted: string): Promise<string> {
  const rawKey = fromB64(requiredEnv('GOOGLE_TOKEN_ENCRYPTION_KEY'));
  if (rawKey.length !== 32) throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes.');
  const combined = fromB64(encrypted);
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12) }, key, combined.slice(12));
  return new TextDecoder().decode(plain);
}
async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
async function supabaseRequest(path: string, key: string, init: RequestInit = {}, userToken?: string): Promise<Response> {
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${userToken ?? key}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers
    }
  });
}
async function getAuthenticatedUser(token: string, key: string): Promise<{ id: string } | null> {
  const response = await supabaseRequest('/auth/v1/user', key, { method: 'GET' }, token);
  const user = await response.json().catch(() => null) as { id?: string } | null;
  return response.ok && user?.id ? { id: user.id } : null;
}
function redirectToProfile(status: 'connected' | 'error', detail?: string): Response {
  const destination = new URL('/profile', requiredEnv('TIMEBANK_SITE_URL'));
  destination.searchParams.set('googleMeet', status);
  if (detail) destination.searchParams.set('reason', detail);
  return new Response(null, { status: 302, headers: { ...corsHeaders, Location: destination.toString() } });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const url = new URL(request.url);
  const supabaseKey = serviceKey();
  const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
  const redirectUri = `${supabaseUrl}/functions/v1/google-meet-oauth`;

  // Google redirects back with code and state. This route must be public, so the
  // one-time state value is the CSRF protection and binds consent to a user.
  if (request.method === 'GET' && url.searchParams.has('state')) {
    try {
      const state = url.searchParams.get('state') ?? '';
      if (!/^[A-Za-z0-9_-]{40,80}$/.test(state)) return redirectToProfile('error', 'invalid_state');
      const hash = await sha256Hex(state);
      // Delete-and-return makes the one-time state consumption atomic, so two
      // parallel callbacks cannot both exchange the same OAuth state.
      const stateResponse = await supabaseRequest(
        `/rest/v1/google_meet_oauth_states?select=user_id&state_hash=eq.${hash}&expires_at=gt.${encodeURIComponent(new Date().toISOString())}`,
        supabaseKey, { method: 'DELETE', headers: { Prefer: 'return=representation' } }
      );
      const stateRows = await stateResponse.json().catch(() => []) as { user_id: string }[];
      if (!stateResponse.ok || !stateRows[0]) return redirectToProfile('error', 'expired_state');

      const providerError = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      if (providerError || !code) return redirectToProfile('error', 'consent_denied');

      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code, client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), client_secret: requiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
          redirect_uri: redirectUri, grant_type: 'authorization_code'
        })
      });
      const tokens = await tokenResponse.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; scope?: string; error?: string };
      if (!tokenResponse.ok || !tokens.access_token) {
        console.error('Google OAuth code exchange failed:', tokens.error ?? tokenResponse.status);
        return redirectToProfile('error', 'token_exchange_failed');
      }
      const grantedScope = tokens.scope ?? openIdScopes.join(' ');
      const grantedScopes = grantedScope.split(/\s+/);
      if (!grantedScopes.includes(meetScope)) return redirectToProfile('error', 'meet_scope_missing');

      const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
        headers: { Authorization: `Bearer ${tokens.access_token}` }
      });
      const googleProfile = await profileResponse.json().catch(() => ({})) as { email?: string; email_verified?: boolean };
      if (!profileResponse.ok || !googleProfile.email || googleProfile.email_verified !== true) {
        return redirectToProfile('error', 'google_email_unverified');
      }

      let refreshToken = tokens.refresh_token;
      if (!refreshToken) {
        const existingResponse = await supabaseRequest(
          `/rest/v1/google_meet_connections?select=encrypted_refresh_token&user_id=eq.${stateRows[0].user_id}&limit=1`,
          supabaseKey, { method: 'GET' }
        );
        const existing = await existingResponse.json().catch(() => []) as { encrypted_refresh_token?: string }[];
        if (!existingResponse.ok || !existing[0]?.encrypted_refresh_token) return redirectToProfile('error', 'refresh_token_missing');
        // Existing encrypted value is retained when Google does not issue a replacement.
        const upsertResponse = await supabaseRequest('/rest/v1/google_meet_connections?on_conflict=user_id', supabaseKey, {
          method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify({ user_id: stateRows[0].user_id, google_email: googleProfile.email, granted_scope: grantedScope, updated_at: new Date().toISOString() })
        });
        if (!upsertResponse.ok) return redirectToProfile('error', 'connection_save_failed');
        return redirectToProfile('connected');
      }

      const encrypted = await encryptRefreshToken(refreshToken);
      const saveResponse = await supabaseRequest('/rest/v1/google_meet_connections?on_conflict=user_id', supabaseKey, {
        method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: stateRows[0].user_id, google_email: googleProfile.email, encrypted_refresh_token: encrypted, granted_scope: grantedScope, updated_at: new Date().toISOString() })
      });
      if (!saveResponse.ok) {
        console.error('Could not store Google Meet connection:', saveResponse.status);
        return redirectToProfile('error', 'connection_save_failed');
      }
      return redirectToProfile('connected');
    } catch (error) {
      console.error('Google Meet OAuth callback failed:', error instanceof Error ? error.message : 'Unknown error');
      return redirectToProfile('error', 'callback_failed');
    }
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'Authentication required.' }, 401);
  const user = await getAuthenticatedUser(token, supabaseKey);
  if (!user) return json({ error: 'Your session is invalid or expired.' }, 401);

  let action: string;
  try { action = String((await request.json() as { action?: unknown }).action ?? ''); }
  catch { return json({ error: 'Invalid request.' }, 400); }

  try {
    if (action === 'start') {
      const stateBytes = crypto.getRandomValues(new Uint8Array(32));
      const state = base64Url(stateBytes);
      const stored = await supabaseRequest('/rest/v1/google_meet_oauth_states', supabaseKey, {
        method: 'POST', headers: { Prefer: 'return=minimal' },
        body: JSON.stringify({ state_hash: await sha256Hex(state), user_id: user.id, expires_at: new Date(Date.now() + 10 * 60_000).toISOString() })
      });
      if (!stored.ok) return json({ error: 'Could not start Google Meet connection.' }, 500);
      await supabaseRequest(`/rest/v1/google_meet_oauth_states?expires_at=lt.${encodeURIComponent(new Date().toISOString())}`, supabaseKey, { method: 'DELETE' });

      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.search = new URLSearchParams({
        client_id: requiredEnv('GOOGLE_OAUTH_CLIENT_ID'), redirect_uri: redirectUri,
        response_type: 'code', scope: openIdScopes.join(' '), state, access_type: 'offline',
        prompt: 'consent', include_granted_scopes: 'true'
      }).toString();
      return json({ authUrl: authUrl.toString() });
    }

    if (action === 'status') {
      const response = await supabaseRequest(
        `/rest/v1/google_meet_connections?select=google_email,connected_at&user_id=eq.${user.id}&limit=1`, supabaseKey, { method: 'GET' }
      );
      const rows = await response.json().catch(() => []) as { google_email: string; connected_at: string }[];
      if (!response.ok) return json({ error: 'Could not check Google Meet connection.' }, 500);
      return json({ connected: !!rows[0], googleEmail: rows[0]?.google_email ?? null, connectedAt: rows[0]?.connected_at ?? null });
    }

    if (action === 'disconnect') {
      const response = await supabaseRequest(
        `/rest/v1/google_meet_connections?select=encrypted_refresh_token&user_id=eq.${user.id}&limit=1`, supabaseKey, { method: 'GET' }
      );
      const rows = await response.json().catch(() => []) as { encrypted_refresh_token: string }[];
      if (rows[0]?.encrypted_refresh_token) {
        const refreshToken = await decryptRefreshToken(rows[0].encrypted_refresh_token);
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken })
        }).catch(() => undefined);
      }
      const removed = await supabaseRequest(`/rest/v1/google_meet_connections?user_id=eq.${user.id}`, supabaseKey, { method: 'DELETE' });
      if (!removed.ok) return json({ error: 'Could not disconnect Google Meet.' }, 500);
      return json({ disconnected: true });
    }

    return json({ error: 'Unsupported action.' }, 400);
  } catch (error) {
    console.error('Google Meet OAuth handler failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'Google Meet could not be connected. Check the server configuration and try again.' }, 500);
  }
});
