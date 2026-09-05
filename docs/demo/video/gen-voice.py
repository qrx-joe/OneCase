# 生成演示视频配音 (edge-tts) + 词级时间戳 + 每段时长清单
# 用法: python docs/demo/video/gen-voice.py
# 产物: tmp/video/voice/SXX.mp3 + SXX.bounds.json(词级发音时间,供字幕精确对齐) + durations.json
import asyncio
import json
import subprocess
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parents[3]
CFG = ROOT / "docs/demo/video/narration.json"
OUT = ROOT / "tmp/video/voice"
OUT.mkdir(parents=True, exist_ok=True)

cfg = json.loads(CFG.read_text(encoding="utf-8"))
cast = cfg["cast"]
durations = {}


async def synth(seg_id: str, text: str, voice: str, mp3: Path, bounds_path: Path):
    com = edge_tts.Communicate(text, voice, rate="+8%", boundary="WordBoundary")
    bounds = []
    with open(mp3, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                # offset/duration 单位为 100 纳秒
                bounds.append([
                    round(chunk["offset"] / 1e7, 3),
                    round((chunk["offset"] + chunk["duration"]) / 1e7, 3),
                    chunk["text"],
                ])
    bounds_path.write_text(json.dumps(bounds, ensure_ascii=False), encoding="utf-8")


for seg in cfg["segments"]:
    mp3 = OUT / f"{seg['id']}.mp3"
    bounds_path = OUT / f"{seg['id']}.bounds.json"
    asyncio.run(synth(seg["id"], seg["narration"], cast, mp3, bounds_path))
    probe = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration",
         "-of", "csv=p=0", str(mp3)],
        capture_output=True, text=True, check=True,
    )
    durations[seg["id"]] = round(float(probe.stdout.strip()), 2)
    print(f"{seg['id']}  {durations[seg['id']]}s  词边界 {len(json.loads(bounds_path.read_text(encoding='utf-8')))} 个")

(OUT / "durations.json").write_text(json.dumps(durations, ensure_ascii=False, indent=1), encoding="utf-8")
total = sum(durations.values())
print(f"total narration: {total:.1f}s (~{total/60:.1f}min)")
