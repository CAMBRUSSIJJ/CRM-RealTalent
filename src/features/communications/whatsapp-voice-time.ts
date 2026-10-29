/** MediaRecorder may report Infinity for the duration of an unfinished
 * WebM/Opus container. Never pass Infinity/NaN into slider or time labels.
 */
export const safeAudioSeconds=(seconds:number):number=>Number.isFinite(seconds)&&seconds>=0?seconds:0

export const formatVoiceTime=(seconds:number):string=>{
  const rounded=Math.floor(safeAudioSeconds(seconds))
  return `${Math.floor(rounded/60)}:${String(rounded%60).padStart(2,'0')}`
}
