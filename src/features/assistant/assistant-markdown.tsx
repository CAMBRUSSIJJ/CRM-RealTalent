import type {ReactNode} from 'react'

/** Render a safe Markdown subset using React text nodes, never raw HTML. */
export interface AssistantMarkdownSource {title:string;url:string;reading?:string}
interface Props {text:string;sources?:AssistantMarkdownSource[]}
const safeHref=(raw:string)=>{
  try {const u=new URL(raw);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password?u.href:null}
  catch{return null}
}
const INLINE=/(\*\*[^*\n]+\*\*|__[^_\n]+__|\x60[^\x60\n]+\x60|\*[^*\n]+\*|_[^_\n]+_|!?\[[^\]\n]+\]\(https?:\/\/[^)\s]+\)|\[\d+\])/g
const inline=(text:string,sources:AssistantMarkdownSource[]=[]):ReactNode[]=>{
  const parts:ReactNode[]=[];let index=0,key=0
  for(const match of text.matchAll(INLINE)){
    const start=match.index??0
    if(start>index)parts.push(text.slice(index,start))
    const token=match[0]
    if(token.startsWith('**')||token.startsWith('__'))parts.push(<strong key={key++}>{token.slice(2,-2)}</strong>)
    else if(token.startsWith('\x60'))parts.push(<code key={key++}>{token.slice(1,-1)}</code>)
    else if(token.startsWith('*')||token.startsWith('_'))parts.push(<em key={key++}>{token.slice(1,-1)}</em>)
    else if(/^\[\d+\]$/.test(token)){
      const source=sources[Number(token.slice(1,-1))-1],href=source?safeHref(source.url):null
      parts.push(href?<a key={key++} href={href} title={source.title} target="_blank" rel="noopener noreferrer">{token}</a>:token)
    }else if(token.startsWith('!['))parts.push(token)
    else{
      const link=token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/),href=link?safeHref(link[2]):null
      parts.push(link&&href?<a key={key++} href={href} target="_blank" rel="noopener noreferrer">{link[1]}</a>:token)
    }
    index=start+token.length
  }
  if(index<text.length)parts.push(text.slice(index))
  return parts
}
const heading=/^\s{0,3}(#{1,6})\s+(?:#\s*)?(.*?)\s*#*\s*$/
const bullet=/^\s{0,3}[-+*]\s+(.+)$/
const ordinal=/^\s{0,3}\d+[.)]\s+(.+)$/
const fence=/^\s*\x60{3}/
const tableLine=(s:string)=>s.trim().startsWith('|')&&s.trim().endsWith('|')
const tableCells=(s:string)=>s.trim().slice(1,-1).split('|').map(v=>v.trim())
const tableSeparator=(s:string)=>tableLine(s)&&tableCells(s).every(v=>/^:?-{3,}:?$/.test(v))
export function AssistantMarkdown({text,sources=[]}:Props){
  const lines=String(text||'').replace(/\r/g,'').split('\n')
  const nodes:ReactNode[]=[];let i=0
  while(i<lines.length){
    const line=lines[i],trim=line.trim()
    if(!trim){i++;continue}
    if(fence.test(trim)){
      i++;const body:string[]=[]
      while(i<lines.length&&!fence.test(lines[i]))body.push(lines[i++])
      if(i<lines.length)i++
      nodes.push(<pre key={nodes.length}><code>{body.join('\n')}</code></pre>)
      continue
    }
    if(i+1<lines.length&&tableLine(line)&&tableSeparator(lines[i+1])){
      const headers=tableCells(line);i+=2;const rows:string[][]=[]
      while(i<lines.length&&tableLine(lines[i])&&rows.length<60)rows.push(tableCells(lines[i++]))
      nodes.push(<div key={nodes.length} className="rt-markdown__table-scroll"><table><thead><tr>{headers.map((v,k)=><th key={k}>{inline(v,sources)}</th>)}</tr></thead>
        <tbody>{rows.map((row,k)=><tr key={k}>{headers.map((_,col)=><td key={col}>{inline(row[col]||'',sources)}</td>)}</tr>)}</tbody></table></div>)
      continue
    }
    const h=line.match(heading)
    if(h){
      const label=inline(h[2],sources)
      nodes.push(h[1].length===1?<h2 key={nodes.length}>{label}</h2>:
        h[1].length===2?<h3 key={nodes.length}>{label}</h3>:<h4 key={nodes.length}>{label}</h4>)
      i++;continue
    }
    const b=line.match(bullet),n=line.match(ordinal)
    if(b||n){
      const ordered=Boolean(n),items:ReactNode[]=[]
      while(i<lines.length){
        const found=lines[i].match(ordered?ordinal:bullet)
        if(!found)break
        items.push(<li key={items.length}>{inline(found[1],sources)}</li>);i++
      }
      nodes.push(ordered?<ol key={nodes.length}>{items}</ol>:<ul key={nodes.length}>{items}</ul>)
      continue
    }
    if(/^>\s*/.test(line)){
      const block:string[]=[]
      while(i<lines.length&&/^>\s*/.test(lines[i]))block.push(lines[i++].replace(/^>\s*/,''))
      nodes.push(<blockquote key={nodes.length}>{inline(block.join(' '),sources)}</blockquote>);continue
    }
    if(/^(?:---+|\*\*\*+|___+)\s*$/.test(trim)){nodes.push(<hr key={nodes.length}/>);i++;continue}
    const paragraph:string[]=[line.trim()];i++
    while(i<lines.length&&lines[i].trim()&&!heading.test(lines[i])&&!bullet.test(lines[i])&&!ordinal.test(lines[i])&&!fence.test(lines[i])&&!/^>\s*/.test(lines[i])&&!(/^(?:---+|\*\*\*+|___+)\s*$/.test(lines[i].trim())))paragraph.push(lines[i++].trim())
    nodes.push(<p key={nodes.length}>{inline(paragraph.join(' '),sources)}</p>)
  }
  return <div className="rt-markdown">{nodes}</div>
}
