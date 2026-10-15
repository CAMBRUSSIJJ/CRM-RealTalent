import { runProvider } from '../_shared/communications/core.ts'
import { handleGmailWebhook } from '../_shared/communications/providers/gmail.ts'

// Legacy Pub/Sub endpoint preserved in V101.11.0.
Deno.serve((request) => runProvider('gmail', request, handleGmailWebhook))
