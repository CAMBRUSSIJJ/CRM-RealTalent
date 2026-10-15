import { runProvider } from '../_shared/communications/core.ts'
import { handleWhatsAppWebhook } from '../_shared/communications/providers/whatsapp.ts'

// Legacy URL preserved in V101.11.0. New deployments may route through communications-gateway/whatsapp.
Deno.serve((request) => runProvider('whatsapp', request, handleWhatsAppWebhook))
