/**
 * Ícones próprios do RealTalent: linha de 2 px, pontas e cantos arredondados,
 * com uma estrela de brilho nos recursos "inteligentes" (Meu Dia, Garimpo, Playbooks, Automações, Assistente).
 * Mesma assinatura de uso dos ícones do lucide (size, className, strokeWidth), para trocar sem mexer nas telas.
 */
import type { JSX, SVGProps } from 'react'

export interface RtIconProps extends Omit<SVGProps<SVGSVGElement>, 'ref'> {
  size?: number | string
  strokeWidth?: number | string
}
export type RtIcon = (props: RtIconProps) => JSX.Element

/** Estrela de quatro pontas preenchida, centrada em (x, y) com raio r. */
const sparkle = (x: number, y: number, r: number) => {
  const k = r * 0.2
  return `M${x} ${y - r}Q${x + k} ${y - k} ${x + r} ${y}Q${x + k} ${y + k} ${x} ${y + r}Q${x - k} ${y + k} ${x - r} ${y}Q${x - k} ${y - k} ${x} ${y - r}Z`
}

const make = (name: string, strokes: string[], sparkles: Array<[number, number, number]> = [], dots: Array<[number, number, number]> = []): RtIcon => {
  const Icon = ({ size = 24, strokeWidth = 2, className = '', ...props }: RtIconProps) => (
    <svg
      xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round"
      className={`rt-icon rt-icon--${name} ${className}`.trim()} aria-hidden="true" focusable="false" {...props}
    >
      {strokes.map((d) => <path key={d} d={d} />)}
      {sparkles.map(([x, y, r]) => <path key={`s${x}${y}`} d={sparkle(x, y, r)} fill="currentColor" stroke="currentColor" strokeWidth={1} strokeLinejoin="round" />)}
      {dots.map(([x, y, r]) => <circle key={`d${x}${y}`} cx={x} cy={y} r={r} fill="currentColor" stroke="none" />)}
    </svg>
  )
  Icon.displayName = `RtIcon(${name})`
  return Icon
}

const rect = (x: number, y: number, w: number, h: number, r: number) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}z`
const circle = (cx: number, cy: number, r: number) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 -${2 * r} 0`

export const RtMyDay = make('my-day', [rect(3.5, 3.5, 7, 7, 2.2), rect(3.5, 13.5, 7, 7, 2.2), rect(13.5, 13.5, 7, 7, 2.2)], [[17, 7, 3.6]])
export const RtContacts = make('contacts', [circle(12, 8, 3.6), 'M5 20c.6-3.4 3.4-5.6 7-5.6s6.4 2.2 7 5.6'])
export const RtPipeline = make('pipeline', [rect(3.5, 4, 4.6, 16, 1.8), rect(9.7, 4, 4.6, 11.5, 1.8), rect(15.9, 4, 4.6, 7.5, 1.8)])
export const RtTasks = make('tasks', [rect(3.5, 3.5, 17, 17, 5), 'M8.5 12.2l2.4 2.4 4.6-5'])
export const RtCommunication = make('communication', ['M20 12.6a8 8 0 0 1-11.8 7L4 20.6l1.1-3.9A8 8 0 0 1 13.4 4.7', 'M8.6 12.4h.01', 'M12 12.4h.01', 'M15.4 12.4h.01'], [[18.6, 5.4, 3]])
export const RtProposals = make('proposals', ['M14 3.5H7.5a2.5 2.5 0 0 0-2.5 2.5v12a2.5 2.5 0 0 0 2.5 2.5h9a2.5 2.5 0 0 0 2.5-2.5V8.5z', 'M14 3.5v5h5', 'M8.8 13h6.4', 'M8.8 16.5h4'])
export const RtAgenda = make('agenda', [rect(3.5, 5, 17, 15.5, 4), 'M3.5 10h17', 'M8 3v3.5', 'M16 3v3.5'], [], [[8.5, 14.5, 1.1], [12, 14.5, 1.1], [15.5, 14.5, 1.1]])
export const RtCalls = make('calls', ['M8.2 3.8l1.6 3.7a1.6 1.6 0 0 1-.4 1.8L8 10.6a11 11 0 0 0 5.4 5.4l1.3-1.4a1.6 1.6 0 0 1 1.8-.4l3.7 1.6a1.6 1.6 0 0 1 .9 1.9l-.5 1.7a2.6 2.6 0 0 1-2.6 1.9A15.6 15.6 0 0 1 3.7 6.9a2.6 2.6 0 0 1 1.9-2.6l1.7-.5a1.6 1.6 0 0 1 1.9.9z'])
export const RtProspecting = make('prospecting', [circle(10.5, 10.5, 6.5), 'M15.3 15.3l4.7 4.7'], [[10.5, 10.5, 3]])
export const RtMetrics = make('metrics', ['M4 20h16', 'M7 16v-3.5', 'M12 16V7.5', 'M17 16v-6'])
export const RtGoals = make('goals', [circle(12, 12, 8.5), circle(12, 12, 4.2)], [], [[12, 12, 1.4]])
export const RtTeams = make('teams', [circle(9, 8.5, 3.2), 'M3.5 19.5c.4-3 2.6-5 5.5-5s5.1 2 5.5 5', 'M15.5 5.6a3.2 3.2 0 0 1 0 5.8', 'M17.6 14.6c1.6.6 2.6 2.4 2.9 4.9'])
export const RtTerritory = make('territory', ['M12 21s-6.5-5.4-6.5-10.8a6.5 6.5 0 0 1 13 0C18.5 15.6 12 21 12 21z', circle(12, 10.2, 2.4)])
export const RtFollowups = make('followups', ['M20 12a8 8 0 1 1-2.4-5.7', 'M20 4.2v4.3h-4.3', 'M12 8v4l2.6 1.6'])
export const RtMeetings = make('meetings', [rect(3, 6.5, 12.5, 11, 3), 'M15.5 10.6l4.3-2.5a.8.8 0 0 1 1.2.7v6.4a.8.8 0 0 1-1.2.7l-4.3-2.5'])
export const RtPlaybooks = make('playbooks', ['M15.5 3.5H7A2.5 2.5 0 0 0 4.5 6v12.5', 'M4.5 18.5A2.5 2.5 0 0 1 7 16h9.5V9', 'M4.5 18.5A2.5 2.5 0 0 0 7 21h9.5v-5'], [[19, 5, 2.9]])
export const RtAutomations = make('automations', ['M4.5 19.5l10-10', 'M12.8 7.8l3.4 3.4'], [[17.6, 6.4, 3.4], [7.4, 6, 2]])
export const RtSettings = make('settings', ['M4 7.5h8.5', 'M18.5 7.5H20', circle(15.5, 7.5, 2.4), 'M4 16.5h1.5', 'M11.5 16.5H20', circle(8.5, 16.5, 2.4)])
export const RtMore = make('more', [], [], [[5.5, 12, 1.6], [12, 12, 1.6], [18.5, 12, 1.6]])
export const RtAssistant = make('assistant', [], [[10.5, 12.5, 7], [18.4, 5.4, 3]])
