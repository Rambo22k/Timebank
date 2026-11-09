type EmailOutboxItem = {
  id: string;
  notification_id: string;
  user_id: string;
  notification_type: string;
  notification_title: string;
  notification_body: string;
  notification_data: Record<string, unknown> | null;
  notification_created_at: string;
  recipient_email: string | null;
  email_confirmed: boolean;
  preferred_language: string;
};

type EmailCopy = { subject: string; heading: string; body: string; path: string };

const copyByTitle: Record<string, { es: EmailCopy; en: EmailCopy }> = {
  'New session request': {
    es: { subject: 'Nueva solicitud de intercambio', heading: 'Tienes una nueva solicitud', body: 'Un miembro te envió una solicitud para intercambiar una habilidad.', path: '/exchanges/requests' },
    en: { subject: 'New exchange request', heading: 'You have a new request', body: 'A member sent you a request to exchange a skill.', path: '/exchanges/requests' }
  },
  'Teaching offer received': {
    es: { subject: 'Te ofrecen enseñar una habilidad', heading: 'Recibiste una oferta para aprender', body: 'Un miembro te ofreció enseñar una habilidad que buscas.', path: '/exchanges/requests' },
    en: { subject: 'Teaching offer received', heading: 'You received an offer to learn', body: 'A member offered to teach a skill you want to learn.', path: '/exchanges/requests' }
  },
  'New contact request': {
    es: { subject: 'Nueva solicitud de contacto', heading: 'Alguien quiere conectar contigo', body: 'Tienes una nueva solicitud de contacto en TimeBank.', path: '/members' },
    en: { subject: 'New contact request', heading: 'Someone wants to connect', body: 'You have a new contact request on TimeBank.', path: '/members' }
  },
  'Contact request accepted': {
    es: { subject: 'Solicitud de contacto aceptada', heading: 'Ya están conectados', body: 'Ahora forman parte de los contactos de TimeBank.', path: '/members' },
    en: { subject: 'Contact request accepted', heading: 'You are now connected', body: 'You are now contacts on TimeBank.', path: '/members' }
  },
  'Contact request declined': {
    es: { subject: 'Actualización de contacto', heading: 'Tu solicitud de contacto recibió una respuesta', body: 'Entra a TimeBank para seguir conectando con la comunidad.', path: '/members' },
    en: { subject: 'Contact request update', heading: 'Your contact request received a response', body: 'Visit TimeBank to continue connecting with the community.', path: '/members' }
  },
  'Request accepted': {
    es: { subject: 'Solicitud aceptada', heading: 'Tu solicitud fue aceptada', body: 'La solicitud fue aceptada y la sesión quedó agendada.', path: '/exchanges/sessions' },
    en: { subject: 'Request accepted', heading: 'Your request was accepted', body: 'The request was accepted and the session is scheduled.', path: '/exchanges/sessions' }
  },
  'Request declined': {
    es: { subject: 'Solicitud rechazada', heading: 'Tu solicitud recibió una respuesta', body: 'La otra persona no podrá realizar este intercambio.', path: '/exchanges/requests' },
    en: { subject: 'Request declined', heading: 'Your request received a response', body: 'The other person is unable to complete this exchange.', path: '/exchanges/requests' }
  },
  'Request expired': {
    es: { subject: 'Solicitud vencida', heading: 'Una solicitud venció', body: 'La solicitud venció antes de recibir respuesta.', path: '/exchanges/requests' },
    en: { subject: 'Request expired', heading: 'A request expired', body: 'The request expired before receiving a response.', path: '/exchanges/requests' }
  },
  'Request cancelled': {
    es: { subject: 'Solicitud cancelada', heading: 'Una solicitud fue cancelada', body: 'La otra persona canceló la solicitud o sesión.', path: '/exchanges/requests' },
    en: { subject: 'Request cancelled', heading: 'A request was cancelled', body: 'The other person cancelled the request or session.', path: '/exchanges/requests' }
  },
  'Exchange under review': {
    es: { subject: 'Intercambio en revisión', heading: 'Se reportó un problema', body: 'Un intercambio fue enviado a revisión. Consulta TimeBank para ver el estado.', path: '/exchanges/sessions' },
    en: { subject: 'Exchange under review', heading: 'An exchange was reported', body: 'An exchange was sent for review. Visit TimeBank to check its status.', path: '/exchanges/sessions' }
  },
  'New proposed session time': {
    es: { subject: 'Nuevo horario propuesto', heading: 'Te propusieron otro horario', body: 'La otra persona propuso un nuevo horario para el intercambio.', path: '/exchanges/requests' },
    en: { subject: 'New time proposed', heading: 'A new time was proposed', body: 'The other person proposed a new time for the exchange.', path: '/exchanges/requests' }
  },
  'Session confirmed': {
    es: { subject: 'Sesión confirmada', heading: 'La sesión fue confirmada', body: 'La otra persona confirmó que la sesión se realizó.', path: '/exchanges/sessions' },
    en: { subject: 'Session confirmed', heading: 'The session was confirmed', body: 'The other person confirmed that the session took place.', path: '/exchanges/sessions' }
  },
  'Exchange completed': {
    es: { subject: 'Intercambio completado', heading: 'El intercambio se completó', body: 'La sesión se completó y los créditos correspondientes quedaron actualizados.', path: '/exchanges/sessions' },
    en: { subject: 'Exchange completed', heading: 'The exchange is complete', body: 'The session is complete and the related credits have been updated.', path: '/exchanges/sessions' }
  },
  'New review': {
    es: { subject: 'Recibiste una reseña', heading: 'Hay una nueva reseña en tu perfil', body: 'Recibiste una reseña después de un intercambio.', path: '/exchanges/reviews' },
    en: { subject: 'You received a review', heading: 'There is a new review on your profile', body: 'You received a review after an exchange.', path: '/exchanges/reviews' }
  },
  'Credits refunded': {
    es: { subject: 'Créditos devueltos', heading: 'Se devolvieron créditos a tu billetera', body: 'Los créditos reservados fueron devueltos a tu saldo disponible.', path: '/wallet' },
    en: { subject: 'Credits refunded', heading: 'Credits were returned to your wallet', body: 'Reserved credits were returned to your available balance.', path: '/wallet' }
  },
  'Donation recorded': {
    es: { subject: 'Donación registrada', heading: 'Tu donación quedó registrada', body: 'Tu aporte al fondo solidario quedó registrado.', path: '/solidarity' },
    en: { subject: 'Donation recorded', heading: 'Your donation was recorded', body: 'Your contribution to the solidarity fund was recorded.', path: '/solidarity' }
  },
  'Solidarity support received': {
    es: { subject: 'Apoyo solidario recibido', heading: 'Recibiste apoyo solidario', body: 'Se agregaron créditos de apoyo a tu billetera.', path: '/solidarity' },
    en: { subject: 'Solidarity support received', heading: 'You received solidarity support', body: 'Support credits were added to your wallet.', path: '/solidarity' }
  },
  'Someone supported your solidarity request': {
    es: { subject: 'Recibiste un aporte solidario', heading: 'Alguien apoyó tu solicitud', body: 'Un miembro de la comunidad hizo un aporte dirigido a tu solicitud solidaria.', path: '/solidarity' },
    en: { subject: 'You received solidarity support', heading: 'Someone supported your request', body: 'A community member made a donation directed to your solidarity request.', path: '/solidarity' }
  },
  'Solidarity request declined': {
    es: { subject: 'Solicitud solidaria no aprobada', heading: 'Tu solicitud solidaria recibió una respuesta', body: 'Revisa TimeBank para consultar la respuesta del equipo.', path: '/solidarity' },
    en: { subject: 'Solidarity request update', heading: 'Your solidarity request received a response', body: 'Visit TimeBank to review the team’s decision.', path: '/solidarity' }
  },
  'Credit balance updated': {
    es: { subject: 'Actualización de créditos', heading: 'Se actualizó tu billetera', body: 'Se actualizó el saldo de tu cuenta de tiempo.', path: '/wallet' },
    en: { subject: 'Credit balance updated', heading: 'Your wallet was updated', body: 'The balance of your time account was updated.', path: '/wallet' }
  },
  'Identity verification approved': {
    es: { subject: 'Identidad verificada', heading: 'Tu identidad fue verificada', body: 'Tu perfil ahora muestra la insignia de verificación.', path: '/profile' },
    en: { subject: 'Identity verified', heading: 'Your identity was verified', body: 'Your profile now displays the verification badge.', path: '/profile' }
  },
  'Identity verification rejected': {
    es: { subject: 'Actualización de verificación', heading: 'Tu verificación requiere atención', body: 'Entra a TimeBank para consultar el estado y los pasos siguientes.', path: '/profile' },
    en: { subject: 'Verification update', heading: 'Your verification needs attention', body: 'Visit TimeBank to review its status and next steps.', path: '/profile' }
  },
  'Report update': {
    es: { subject: 'Actualización de reporte', heading: 'Hay una actualización sobre tu reporte', body: 'Entra a TimeBank para consultar la información disponible.', path: '/profile' },
    en: { subject: 'Report update', heading: 'There is an update to your report', body: 'Visit TimeBank to review the available information.', path: '/profile' }
  }
};

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let mismatch = 0;
  for (let i = 0; i < left.length; i++) mismatch |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return mismatch === 0;
}

function escapeHtml(value: string): string {
  const entities: Record<string, string> = {
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  };
  return value.replace(/[&<>"']/g, character => entities[character] ?? character);
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

function getSupabaseSecretKey(): string {
  const namedKeys = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (namedKeys) {
    const keys = JSON.parse(namedKeys) as Record<string, string>;
    const key = keys.default ?? Object.values(keys)[0];
    if (key) return key;
  }
  return requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
}

const jsonHeaders = { 'Content-Type': 'application/json' };

Deno.serve(async request => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const dispatchSecret = requiredEnv('EMAIL_DISPATCH_SECRET');
    const authorization = request.headers.get('authorization') ?? '';
    const providedSecret = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    if (!constantTimeEqual(providedSecret, dispatchSecret)) return new Response('Unauthorized', { status: 401 });

    const supabaseUrl = requiredEnv('SUPABASE_URL').replace(/\/$/, '');
    const serviceRoleKey = getSupabaseSecretKey();
    const resendApiKey = requiredEnv('RESEND_API_KEY');
    const fromEmail = requiredEnv('TIMEBANK_EMAIL_FROM');
    const siteUrl = requiredEnv('TIMEBANK_SITE_URL').replace(/\/$/, '');
    const parsedSiteUrl = new URL(siteUrl);
    if (parsedSiteUrl.protocol !== 'https:' && parsedSiteUrl.hostname !== 'localhost') {
      throw new Error('TIMEBANK_SITE_URL must use HTTPS outside local development');
    }

    const serviceHeaders = {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      ...jsonHeaders
    };
    const claimResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/claim_email_outbox_batch`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify({ p_batch_size: 20 })
    });
    if (!claimResponse.ok) throw new Error(`Could not claim email queue (HTTP ${claimResponse.status})`);

    const items = await claimResponse.json() as EmailOutboxItem[];
    let sent = 0;
    let skipped = 0;
    let retried = 0;

    for (const item of items) {
      if (!item.recipient_email || !item.email_confirmed) {
        await finishItem(supabaseUrl, serviceHeaders, item.id, 'skipped');
        skipped++;
        continue;
      }

      const localized = copyByTitle[item.notification_title];
      if (!localized) {
        await finishItem(supabaseUrl, serviceHeaders, item.id, 'skipped');
        skipped++;
        continue;
      }

      const language = item.preferred_language === 'en' ? 'en' : 'es';
      const copy = localized[language];
      const href = new URL(copy.path, `${siteUrl}/`).toString();
      const html = `<!doctype html><html lang="${language}"><body style="margin:0;background:#f4f7f5;font-family:Arial,sans-serif;color:#17312e"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fff;border:1px solid #dfe8e3;border-radius:16px"><div style="font-size:20px;font-weight:700;color:#087e78">TimeBank</div><h1 style="font-size:24px;margin:28px 0 12px">${escapeHtml(copy.heading)}</h1><p style="font-size:16px;line-height:1.6;color:#5f716f">${escapeHtml(copy.body)}</p><p style="margin:28px 0"><a href="${escapeHtml(href)}" style="display:inline-block;padding:13px 20px;background:#087e78;color:#fff;text-decoration:none;border-radius:8px;font-weight:700">${language === 'en' ? 'Open TimeBank' : 'Abrir TimeBank'}</a></p><p style="font-size:12px;color:#83918f">${language === 'en' ? 'You received this transactional email because of activity in your TimeBank account.' : 'Recibiste este correo porque hubo actividad en tu cuenta de TimeBank.'}</p></main></body></html>`;
      const text = `${copy.heading}\n\n${copy.body}\n\n${href}`;

      try {
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': `timebank-notification-${item.notification_id}`
          },
          body: JSON.stringify({
            from: `TimeBank <${fromEmail}>`,
            to: [item.recipient_email],
            subject: copy.subject,
            html,
            text
          })
        });
        const responseBody = await response.json().catch(() => ({})) as { id?: string; message?: string; name?: string };
        if (!response.ok) {
          const reason = `Resend ${response.status}: ${responseBody.name ?? responseBody.message ?? 'delivery failed'}`;
          await finishItem(supabaseUrl, serviceHeaders, item.id, 'retry', undefined, reason);
          retried++;
          continue;
        }
        await finishItem(supabaseUrl, serviceHeaders, item.id, 'sent', responseBody.id);
        sent++;
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'Email delivery failed';
        await finishItem(supabaseUrl, serviceHeaders, item.id, 'retry', undefined, reason);
        retried++;
      }
    }

    return Response.json({ processed: items.length, sent, skipped, retried });
  } catch (error) {
    console.error('Email outbox dispatch failed:', error instanceof Error ? error.message : 'Unknown error');
    return Response.json({ error: 'Email outbox processing failed' }, { status: 500 });
  }
});

async function finishItem(
  supabaseUrl: string,
  headers: Record<string, string>,
  id: string,
  outcome: 'sent' | 'skipped' | 'retry',
  providerMessageId?: string,
  error?: string
): Promise<void> {
  const response = await fetch(`${supabaseUrl}/rest/v1/rpc/finish_email_outbox_delivery`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      p_id: id,
      p_outcome: outcome,
      p_provider_message_id: providerMessageId ?? null,
      p_error: error?.slice(0, 500) ?? null
    })
  });
  if (!response.ok) throw new Error(`Could not update email queue item (HTTP ${response.status})`);
}
