// Runtime dependency policy.
// Keep the V100.60.1 lean baseline mandatory while allowing dependencies
// explicitly approved by later product capabilities.
export const BASE_RUNTIME_DEPENDENCIES = [
  '@supabase/supabase-js',
  'lucide-react',
  'react',
  'react-dom',
]

export const APPROVED_FEATURE_RUNTIME_DEPENDENCIES = {
  '@whiskeysockets/baileys': 'V101.8.4-H4 WhatsApp QR Local multi-device transport',
  qrcode: 'V101.8.4-H4 WhatsApp QR Local QR rendering',
  'whatsapp-web.js': 'V101.8.4-H5 WhatsApp Web Chromium transport',
}

export const ALLOWED_RUNTIME_DEPENDENCIES = [
  ...BASE_RUNTIME_DEPENDENCIES,
  ...Object.keys(APPROVED_FEATURE_RUNTIME_DEPENDENCIES),
].sort()

export function auditRuntimeDependencies(dependencies = []) {
  const normalized = [...dependencies].sort()
  const missingBaseline = BASE_RUNTIME_DEPENDENCIES.filter((name) => !normalized.includes(name))
  const unexpected = normalized.filter((name) => !ALLOWED_RUNTIME_DEPENDENCIES.includes(name))
  return {
    ok: missingBaseline.length === 0 && unexpected.length === 0,
    missingBaseline,
    unexpected,
  }
}
