#!/usr/bin/env node
// Generates a short-lived, single-use code visible only on the local terminal.
import {issuePairingCode} from './browser-connector.mjs'
const {code,expires}=issuePairingCode()
console.log('')
console.log('RealTalent IA — pareamento do navegador')
console.log('Abra CRM > Configurações > RealTalent IA > IA deste computador.')
console.log('Código de 6 dígitos: '+code)
console.log('Expira em '+new Date(expires).toLocaleTimeString('pt-BR')+' (5 minutos).')
console.log('Nunca envie o código ou tokens para outras pessoas.')
console.log('')
