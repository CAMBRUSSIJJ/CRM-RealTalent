import fs from 'node:fs'
const read=(p)=>fs.readFileSync(p,'utf8'); const json=(p)=>JSON.parse(read(p)); const checks=[]; const ok=(n,v)=>{checks.push([n,!!v]);console.log(`${v?'OK  ':'FAIL'} ${n}`)}
const agent=read('scripts/realtalent-prospecting-agent.mjs'), service=read('src/services/prospecting-linux-agent.ts'), page=read('src/features/prospecting/prospecting-page.tsx'), pkg=json('package.json')
ok('Agent H4/H5 ativo',(agent.includes("const VERSION = '101.10.3-H4'")||(agent.includes("const VERSION = '101.10.3-H5'")||(agent.includes("const VERSION = '101.10.3-H6'")||agent.includes("const VERSION = '101.10.3-H8'")||agent.includes("const VERSION = '101.10.3-H9'")))))
ok('coverage separa tentado/sucesso/falha',agent.includes('attemptedTerritoryPercent')&&agent.includes('successfulTerritoryPercent')&&agent.includes('failedTerritoryPercent'))
ok('coverage contabiliza células falhadas',agent.includes('failedCells')&&agent.includes('attemptedCells'))
ok('falha não alimenta ganho marginal',agent.includes('recordCoverageRun(job, 0, cell, false)'))
ok('saturação usa runs válidas/falhas',agent.includes('validRuns')&&agent.includes('failedRuns')&&agent.includes('saturationConfidence'))
ok('territoryPercent é alias de sucesso',agent.includes('job.coverage.territoryPercent = job.coverage.successfulTerritoryPercent'))
ok('não força mais 100% após falhas',!agent.includes('if (job.coverage.territoryPercent < 100) job.coverage.territoryPercent = 100'))
ok('frontend tipa coverage truth',service.includes('attemptedTerritoryPercent')&&service.includes('failedCells')&&service.includes('saturationConfidence'))
ok('UI mostra cobertura com sucesso',page.includes('Cobertura com sucesso')&&page.includes('Área tentada')&&(page.includes('território com falha')||page.includes('km² com falha')))
ok('runtime coverage registrado',pkg.scripts?.['runtime:prospecting-coverage']?.includes('coverage_truth_smoke'))
const failed=checks.filter(([,v])=>!v); console.log(`\nV101.10.3-H2 Coverage Truth: ${checks.length-failed.length}/${checks.length}`); if(failed.length)process.exit(1)
