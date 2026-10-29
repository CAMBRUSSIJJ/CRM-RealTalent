import {describe,it,expect} from 'vitest'
import {formatVoiceTime,safeAudioSeconds} from './whatsapp-voice-time'

describe('WhatsApp audio: finite duration',()=>{
  it('never displays Infinity:NaN for a recorded audio with unknown length',()=>{
    expect(safeAudioSeconds(Infinity)).toBe(0)
    expect(safeAudioSeconds(NaN)).toBe(0)
    expect(safeAudioSeconds(-1)).toBe(0)
    expect(formatVoiceTime(Infinity)).toBe('0:00')
    expect(formatVoiceTime(NaN)).toBe('0:00')
  })
  it('still displays the real duration when metadata becomes available',()=>{
    expect(formatVoiceTime(57)).toBe('0:57')
    expect(formatVoiceTime(61.9)).toBe('1:01')
  })
})
