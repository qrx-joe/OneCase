# 生成演示视频配音 (edge-tts) + 每段时长清单
# 用法: python docs/demo/video/gen-voice.py   (产物: tmp/video/voice/SXX.mp3 + durations.json)
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
CFG = ROOT / "docs/demo/video/narration.json"
OUT = ROOT / "tmp/video/voice"
OUT.mkdir(parents=True, exist_ok=True)

cfg = json.loads(CFG.read_text(encoding="utf-8"))
cast = cfg["cast"]
durations = {}
for seg in cfg["segments"]:
    mp3 = OUT / f"{seg['id']}.mp3"
    if not mp3.exists():
        subprocess.run(
            ["edge-tts", "--voice", cast, "--rate", "+8%", "--text", seg["narration"],
             "--write-media", str(mp3)],
            check=True,
        )
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True, check=True,
    )
    durations[seg["id"]] = round(float(probe.stdout.strip()), 2)
    print(f"{seg['id']}  {durations[seg['id']]}s  {mp3.name}")

(OUT / "durations.json").write_text(json.dumps(durations, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(durations.values())
print(f"total narration: {total:.1f}s (~{total/60:.1f}min)")
