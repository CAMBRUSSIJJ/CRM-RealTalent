import { runProvider } from '../_shared/communications/core.ts'
import { handleMicrosoftWebhook } from '../_shared/communications/providers/microsoft.ts'

// Legacy Microsoft Graph endpoint preserved in V101.11.0.
Deno.serve((request) => runProvider('microsoft', request, handleMicrosoftWebhook))
