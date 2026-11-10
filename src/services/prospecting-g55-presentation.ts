/**
 * Safeguard the guided-review UI from legacy registry-only model output.
 * A search snippet or partially matched identity is not verified evidence.
 */
export interface ResearchEvidencePresentationInput {
  summary:string
  hypotheses:string[]
  questions:string[]
  approach:string
  pageRead:boolean
  quality:string
  candidateEvents?:unknown[]
  sources?:Array<{url:string;reading:'page'|'snippet';identity:'compatible'|'partial'|'unconfirmed'}>
}

export function hasConfirmedInvestigationEvidenceG55(data:ResearchEvidencePresentationInput):boolean {
  return data.pageRead===true && data.quality==='page_reviewed' &&
    Array.isArray(data.sources) && data.sources.some(source=>
      source.reading==='page'&&source.identity==='compatible'&&
      typeof source.url==='string'&&source.url.startsWith('https://'))
}

export function guardInvestigationPresentationG55<T extends ResearchEvidencePresentationInput>(data:T):T {
  if(hasConfirmedInvestigationEvidenceG55(data))return data
  return {
    ...data,
    summary:'Nenhuma página pública foi associada com segurança a esta empresa. Os dados do cadastro, isoladamente, não comprovam serviços, necessidades ou oportunidades comerciais.',
    hypotheses:[],
    questions:[],
    approach:'',
    candidateEvents:[],
  }
}
