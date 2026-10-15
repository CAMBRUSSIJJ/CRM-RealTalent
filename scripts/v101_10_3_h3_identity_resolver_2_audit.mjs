import fs from 'node:fs'
const read=(p)=>fs.readFileSync(p,'utf8'); const json=(p)=>JSON.parse(read(p)); const checks=[]; const ok=(n,v)=>{checks.push([n,!!v]);console.log(`${v?'OK  ':'FAIL'} ${n}`)}
const agent=read('scripts/realtalent-prospecting-agent.mjs'), workspace=read('src/services/prospecting-workspace.ts'), pkg=json('package.json')
ok('strongIdentityKeys existe',agent.includes('function strongIdentityKeys'))
ok('strong keys limitadas a CNPJ/OSM',agent.includes("key.startsWith('cnpj:') || key.startsWith('osm:')"))
ok('CNPJ resolve automaticamente',agent.includes('if (acnpj.length === 14 && acnpj === bcnpj) return 100'))
ok('OSM id resolve automaticamente',agent.includes('if (aosm && aosm === bosm) return 100'))
ok('domínio isolado não auto-merge',agent.includes('else if (sameDomain) score = Math.max(score, 58)'))
ok('telefone isolado não auto-merge',agent.includes('else if (samePhone) score = Math.max(score, 62)'))
ok('merge automático exige score >=93',agent.includes('score >= 93')&&(agent.includes('preResolved')||agent.includes('postResolved')||agent.includes('resolved?.score >= 93')))
ok('mesma unidade física pode resolver',agent.includes('sameName && sameAddress && sameCity')&&agent.includes('distance < 0.12'))
ok('workspace legado continua com duplicate review',workspace.includes("DuplicateLevel = 'none' | 'possible' | 'confirmed'"))
ok('runtime identity registrado',pkg.scripts?.['runtime:prospecting-identity']?.includes('identity_resolver_2_smoke'))
const failed=checks.filter(([,v])=>!v); console.log(`\nV101.10.3-H3 Identity Resolver 2.0: ${checks.length-failed.length}/${checks.length}`); if(failed.length)process.exit(1)
