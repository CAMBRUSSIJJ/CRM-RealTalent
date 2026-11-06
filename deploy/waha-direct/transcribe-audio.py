#!/usr/bin/env python3
"""Transcrição estritamente local; saída JSON, nenhum serviço externo."""
import json
import os
import sys

def main():
    if len(sys.argv) != 2 or not os.path.isfile(sys.argv[1]):
        raise ValueError("Arquivo de áudio inválido")
    from av import open as av_open
    from faster_whisper import WhisperModel

    # Limite explícito de duração para não bloquear a interface.
    with av_open(sys.argv[1]) as container:
        duration_us = container.duration
        if duration_us is not None and duration_us > 180 * 1_000_000:
            raise ValueError("Áudio excede o limite local de 3 minutos")
    model = os.getenv("REALTALENT_WHISPER_MODEL", "base")
    if model not in ("tiny", "base", "small"):
        raise ValueError("Modelo local não permitido")
    cache_dir = os.path.expanduser("~/.local/share/realtalent-whisper/models")
    stt = WhisperModel(model, device="cpu", compute_type="int8",
                       cpu_threads=4, download_root=cache_dir, local_files_only=True)
    segments, _ = stt.transcribe(sys.argv[1], language="pt", beam_size=2,
                                 condition_on_previous_text=False, vad_filter=False,
                                 without_timestamps=True)
    phrase = " ".join(segment.text.strip() for segment in segments if segment.text.strip())
    print(json.dumps({"text": phrase[:4500]}, ensure_ascii=False))

if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print("Transcrição local indisponível: " + str(exc)[:150], file=sys.stderr)
        sys.exit(1)
