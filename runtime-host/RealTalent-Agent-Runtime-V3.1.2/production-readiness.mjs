import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { platformManifest } from './platform-manifest.mjs'
import { evaluationState } from './reliability-evaluation.mjs'

const ROOT=path.dirname(fileURLToPath(import.meta.url))
const exists=(name)=>fs.existsSync(path.join(ROOT,name))
export function collectProductionReadiness(){
  const manifest=platformManifest();const evaluation=evaluationState()
  const controls=[
    ['loopback-default',manifest.boundaries.defaultBind==='127.0.0.1'],
    ['governance-layer',exists('governance-selftest.mjs')],
    ['identity-governance',exists('identity-team-governance-selftest.mjs')],
    ['builder-sandbox',exists('builder_agent.py')],
    ['browser-verification',exists('browser_qa.py')],
    ['project-brain',exists('project-brain-selftest.mjs')],
    ['continuous-agent',exists('continuous-agent.mjs')],
    ['release-gate',exists('reliability-evaluation.mjs')],
    ['grounding-guard',exists('grounding-selftest.mjs')],
  ].map(([id,pass])=>({id,pass:Boolean(pass)}))
  const deterministicPass=controls.every(x=>x.pass)
  const releaseGate=evaluation.gate||{status:'NOT_RUN',pass:false}
  const baselineAccepted=Boolean(evaluation.baseline)
  const crmFullBuildAttested=process.env.REALTALENT_CRM_FULL_GATES_ATTESTED==='1'
  const blueFullBuildAttested=process.env.REALTALENT_BLUE_FULL_GATES_ATTESTED==='1'
  const cryptoIdentityAttested=process.env.REALTALENT_IDENTITY_CRYPTO_ATTESTED==='1'
  const releaseCandidate=deterministicPass&&baselineAccepted&&releaseGate.pass
  const productionReady=releaseCandidate&&crmFullBuildAttested&&blueFullBuildAttested&&cryptoIdentityAttested
  return {
    version:manifest.version,
    grade:productionReady?'PRODUCTION_READY':(releaseCandidate?'RELEASE_CANDIDATE':'DEVELOPMENT'),
    productionReady,
    releaseCandidate,
    baselineAccepted,
    deterministicPass,
    releaseGate,
    controls,
    attestation:{runtime:'tested by V2 selftest/audit',crmFullBuild:crmFullBuildAttested?'ATTESTED_EXTERNALLY':'NOT_ATTESTED_BY_RUNTIME',blueOceanFullBuild:blueFullBuildAttested?'ATTESTED_EXTERNALLY':'NOT_ATTESTED_BY_RUNTIME',identity:cryptoIdentityAttested?'CRYPTO_ATTESTED_EXTERNALLY':'LOCAL_LOOPBACK_CLAIM_ONLY'},
    blockers:[
      ...(baselineAccepted?[]:['No accepted reliability baseline is present in this state directory.']),
      ...(releaseGate.pass?[]:['Accepted reliability baseline/release gate is not currently PASS.']),
      ...(crmFullBuildAttested?[]:['Full CRM typecheck/test/build must be executed with product dependencies installed before production deployment.']),
      ...(blueFullBuildAttested?[]:['Full Blue Ocean typecheck/test/build must be executed with product dependencies installed before production deployment.']),
      ...(cryptoIdentityAttested?[]:['Supabase identity is a local session claim in V2.0; cryptographic JWT attestation remains required for multi-user/remote deployment.']),
    ]
  }
}
if(import.meta.url===`file://${process.argv[1]}`){console.log(JSON.stringify(collectProductionReadiness(),null,2))}
