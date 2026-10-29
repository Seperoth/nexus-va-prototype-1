// Deploy only when Supabase and Resend are configured. Called by a payments UPDATE webhook.
// Webhook header: x-webhook-secret = PAYMENT_WEBHOOK_SECRET (an Edge Function secret).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request: Request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = Deno.env.get('PAYMENT_WEBHOOK_SECRET');
  if (!secret || request.headers.get('x-webhook-secret') !== secret) return new Response('Unauthorized', { status: 401 });
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!resendKey) return Response.json({ error: 'Resend is not configured' }, { status: 503 });
  const payload = await request.json();
  if (payload.type !== 'UPDATE' || payload.table !== 'payments' || payload.record?.status !== 'Paid' || payload.old_record?.status === 'Paid') return Response.json({ skipped: true });
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  // Do not trust webhook-supplied recipient or amount; read the authoritative paid record.
  const { data: payment, error: paymentError } = await db.from('payments').select('*').eq('id', payload.record.id).eq('status','Paid').single();
  if (paymentError || !payment) return Response.json({ error: 'Paid record not found' }, { status: 404 });
  const { data: ticket, error: ticketError } = await db.from('tickets').select('*').eq('id', payment.ticketId).single();
  if (ticketError || !ticket) return Response.json({ error: 'Ticket not found' }, { status: 404 });
  const { data: client, error: clientError } = await db.from('profiles').select('name,email').eq('id', ticket.clientId).single();
  if (clientError || !client) return Response.json({ error: 'Client not found' }, { status: 404 });
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `payment-confirmation-${payment.id}` },
    body: JSON.stringify({ from: Deno.env.get('RESEND_FROM_EMAIL') || 'Nexus VA <onboarding@resend.dev>', to: [client.email], subject: `Test payment confirmed · NX-${ticket.number}`, text: `Hi ${client.name},\n\nYour simulated payment of $${payment.amount} for ${ticket.title} is confirmed. No real money was charged.\n\nYou can follow your project in your Nexus VA workspace.\n${Deno.env.get('APP_URL') || 'http://localhost:5173'}\n\nA little support. A lot of possibility.\nNexus VA` })
  });
  if (!response.ok) return Response.json({ error: 'Email delivery failed', status: response.status }, { status: 502 });
  return Response.json({ sent: true });
});
