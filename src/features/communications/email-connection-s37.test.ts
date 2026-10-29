import {describe,it,expect} from 'vitest'
import {emailConnectGate,localOAuthCallbacks} from './email-connection-s37'
import type {CommunicationsGatewayHealth} from '../../services/local-communications-gateway'
const health:CommunicationsGatewayHealth={ok:true,mode:'local-gateway',version:'s37',syncIntervalMs:30000,providers:{google:true,microsoft:false,whatsapp:true}}
describe('S3.7 official email connection',()=>{
 it('requires a healthy configured provider and permission',()=>{expect(emailConnectGate('local',null,'google',true).ready).toBe(false);expect(emailConnectGate('local',health,'google',true).ready).toBe(true);expect(emailConnectGate('local',health,'microsoft',true).ready).toBe(false);expect(emailConnectGate('local',health,'google',false).ready).toBe(false)})
 it('allows cloud OAuth independently of a local gateway',()=>{expect(emailConnectGate('supabase',null,'microsoft',true).ready).toBe(true)})
 it('uses correct local redirect hosts and gateway port',()=>{expect(localOAuthCallbacks().google).toBe('http://127.0.0.1:3012/oauth/google/callback');expect(localOAuthCallbacks().microsoft).toBe('http://localhost:3012/oauth/microsoft/callback')})
})
