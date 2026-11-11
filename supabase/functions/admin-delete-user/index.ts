const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

type StorageCleanup = { id: number; bucket_id: string; object_path: string };

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: corsHeaders });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function errorMessage(payload: unknown): string {
  if (payload && typeof payload === 'object') {
    const row = payload as Record<string, unknown>;
    for (const key of ['message', 'msg', 'error_description', 'error']) {
      if (typeof row[key] === 'string' && row[key]) return row[key] as string;
    }
  }
  return 'The server could not complete the account deletion.';
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

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);

  const authorization = request.headers.get('Authorization') ?? '';
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return json({ error: 'Authentication required.' }, 401);

  let targetUserId = '';
  try {
    const body = await request.json() as { userId?: unknown };
    targetUserId = typeof body.userId === 'string' ? body.userId : '';
  } catch {
    return json({ error: 'A valid user ID is required.' }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(targetUserId)) {
    return json({ error: 'A valid user ID is required.' }, 400);
  }

  try {
    const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
    const adminKey = serviceKey();
    const serviceHeaders = { apikey: adminKey, Authorization: `Bearer ${adminKey}` };

    const callerResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: adminKey, Authorization: `Bearer ${token}` }
    });
    const caller = await callerResponse.json().catch(() => ({})) as { id?: string };
    if (!callerResponse.ok || !caller.id) return json({ error: 'Your session is invalid or expired.' }, 401);
    if (caller.id === targetUserId) return json({ error: 'You cannot permanently delete your own administrator account.' }, 400);

    const roleResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_roles?select=user_id&user_id=eq.${encodeURIComponent(caller.id)}&role=eq.admin&limit=1`,
      { headers: serviceHeaders }
    );
    const roles = await roleResponse.json().catch(() => []) as unknown[];
    if (!roleResponse.ok || roles.length === 0) return json({ error: 'Administrator access required.' }, 403);

    const prepareResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/prepare_admin_user_deletion`, {
      method: 'POST',
      headers: { ...serviceHeaders, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: targetUserId })
    });
    const preparePayload = await prepareResponse.json().catch(() => ({}));
    if (!prepareResponse.ok) return json({ error: errorMessage(preparePayload) }, prepareResponse.status === 401 ? 401 : 409);

    const cleanupResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_deletion_storage_cleanup?select=id,bucket_id,object_path&user_id=eq.${encodeURIComponent(targetUserId)}`,
      { headers: serviceHeaders }
    );
    const cleanupItems = await cleanupResponse.json().catch(() => []) as StorageCleanup[];
    if (!cleanupResponse.ok) return json({ error: 'The account is protected, but its private files could not be checked for cleanup.' }, 502);

    for (const item of cleanupItems) {
      const storageResponse = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(item.bucket_id)}`, {
        method: 'DELETE',
        headers: { ...serviceHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefixes: [item.object_path] })
      });
      if (!storageResponse.ok && storageResponse.status !== 404) {
        return json({ error: 'The account is anonymized and disabled, but private file cleanup is pending. Retry the deletion to finish.' }, 502);
      }
    }

    const authDeleteResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(targetUserId)}`, {
      method: 'DELETE', headers: serviceHeaders
    });
    if (!authDeleteResponse.ok && authDeleteResponse.status !== 404) {
      const authDeleteError = await authDeleteResponse.json().catch(() => ({}));
      return json({ error: `The account is anonymized and disabled, but the Auth identity could not be removed. Retry to finish. ${errorMessage(authDeleteError)}` }, 502);
    }

    const completeResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/complete_admin_user_deletion`, {
      method: 'POST',
      headers: { ...serviceHeaders, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_user_id: targetUserId })
    });
    if (!completeResponse.ok) return json({ error: 'The Auth identity was removed, but the audit status could not be finalized. Retry to reconcile.' }, 502);

    const cleanupDeleteResponse = await fetch(
      `${supabaseUrl}/rest/v1/user_deletion_storage_cleanup?user_id=eq.${encodeURIComponent(targetUserId)}`,
      { method: 'DELETE', headers: serviceHeaders }
    );
    if (!cleanupDeleteResponse.ok) return json({ error: 'The user was deleted, but the cleanup queue could not be cleared. Retry to reconcile.' }, 502);

    return json({ success: true, userId: targetUserId });
  } catch (error) {
    console.error('Admin user deletion failed:', error instanceof Error ? error.message : 'Unknown error');
    return json({ error: 'The server could not complete the account deletion.' }, 500);
  }
});
