# 逐段合成演示视频: webm + 配音 mp3 + SRT 字幕(烧录) → 段 mp4 → 拼接成片
# 用法: python docs/demo/video/compose.py   (产物: docs/demo/video/OneCase-备份演示视频.mp4)
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
RAW = ROOT / "tmp/video/raw"
WORK = ROOT / "tmp/video/seg"
OUT = ROOT / "docs/demo/video/OneCase-备份演示视频.mp4"
CFG = json.loads((ROOT / "docs/demo/video/narration.json").read_text(encoding="utf-8"))
DUR = json.loads((ROOT / "tmp/video/voice/durations.json").read_text(encoding="utf-8"))
WORK.mkdir(parents=True, exist_ok=True)

STYLE = (
    "FontName=Microsoft YaHei,FontSize=12,PrimaryColour=&H00FFFFFF,"
    "OutlineColour=&H82000000,Outline=1,Shadow=0,Bold=1,MarginV=22,Spacing=0.4"
)


def probe(path):
    r = subprocess.run(
        ["ffprobe", "-v", "quiet", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def split_lines(text, max_len=22):
    """按标点切句,长句再按逗号切,拼到不超过 max_len"""
    parts = re.split(r"(?<=[。！？；])", text)
    lines = []
    for p in parts:
        p = p.strip()
        if not p:
            continue
        buf = ""
        for piece in re.split(r"(?<=[，、：])", p):
            if buf and len(buf) + len(piece) > max_len:
                lines.append(buf)
                buf = piece
            else:
                buf += piece
        if buf:
            lines.append(buf)
    return lines


_PUNCT = set("，。：；！？、（）()《》<>\"\"''\"'…—·,.:;!? \t\n")


def make_srt(seg_id, narration, audio_dur):
    lines = split_lines(narration)
    bounds_file = ROOT / f"tmp/video/voice/{seg_id}.bounds.json"
    fmt = lambda s: f"{int(s//3600):02d}:{int(s%3600//60):02d}:{int(s%60):02d},{int(s%1*1000):03d}"

    # 优先用 edge-tts 词级时间戳对齐(字幕起止贴合真实发音),无时间戳时回退按字数比例
    entries = None
    if bounds_file.exists():
        bounds = json.loads(bounds_file.read_text(encoding="utf-8"))
        strip = lambda s: "".join(ch for ch in s if ch not in _PUNCT)
        # 顺序消费对齐: 词序列即原文去标点后的顺序切分,逐字消费满一行即换行,
        # 无比例缩放误差;若词流提前耗尽(个别字符被 TTS 吞掉),剩余行均分残余时间
        if bounds and sum(len(strip(l)) for l in lines) > 0:
            entries = []
            wi, last_end = 0, 0.0
            total_lines = len(lines)
            for li, line in enumerate(lines):
                n = len(strip(line))
                start = max(0.0, bounds[wi][0] - 0.1) if wi < len(bounds) else last_end
                consumed = 0
                while consumed < n and wi < len(bounds):
                    consumed += len(strip(bounds[wi][2]))
                    last_end = bounds[wi][1]
                    wi += 1
                end = last_end + 0.15
                if entries and start < entries[-1][1]:
                    start = entries[-1][1]
                if end <= start + 0.4:
                    end = start + 0.6
                if li == total_lines - 1 and wi >= len(bounds):
                    end = audio_dur + 0.2
                entries.append([start, min(end, audio_dur + 0.25), line])
            # 词流耗尽但行未分完: 剩余行均分残余时间
            if wi >= len(bounds) and len(entries) < total_lines:
                remaining = [l for l in lines[len(entries):]]
                span = max(0.6, (audio_dur - last_end) / max(1, len(remaining)))
                for j, line in enumerate(remaining):
                    start = last_end + j * span
                    entries.append([start, min(start + span, audio_dur + 0.25), line])

    if entries is None:
        total_chars = sum(len(l) for l in lines)
        entries = []
        t = 0.25
        for line in lines:
            span = audio_dur * (len(line) / total_chars)
            start, end = t, min(t + span, audio_dur + 0.2)
            entries.append([start, end, line])
            t = end

    srt = []
    for i, (start, end, line) in enumerate(entries, 1):
        srt.append(f"{i}\n{fmt(start)} --> {fmt(end)}\n{line}\n")
    srt_file = WORK / f"{seg_id}.srt"
    srt_file.write_text("\n".join(srt), encoding="utf-8")
    return srt_file


segment_files = []
for seg in CFG["segments"]:
    sid = seg["id"]
    webm = RAW / f"{sid}.webm"
    mp3 = ROOT / f"tmp/video/voice/{sid}.mp3"
    if not webm.exists() or not mp3.exists():
        raise SystemExit(f"missing {webm} or {mp3}")
    va, aa = probe(webm), probe(mp3)
    target = round(aa + 0.9, 2)
    srt = make_srt(sid, seg["narration"], aa)
    seg_mp4 = WORK / f"{sid}.mp4"
    vf = (
        f"tpad=stop_mode=clone:stop_duration=40,trim=duration={target},"
        f"setpts=PTS-STARTPTS,subtitles={srt.name}:force_style='{STYLE}'"
    )
    cmd = [
        "ffmpeg", "-y", "-loglevel", "error",
        "-i", str(webm), "-i", str(mp3),
        "-filter_complex", f"[0:v]{vf}[v]",
        "-map", "[v]", "-map", "1:a",
        "-c:v", "libx264", "-crf", "24", "-preset", "medium", "-r", "30", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "2",
        "-t", str(target), "-movflags", "+faststart",
        str(seg_mp4),
    ]
    subprocess.run(cmd, check=True, cwd=str(WORK))
    segment_files.append(seg_mp4)
    print(f"{sid}: webm {va:.1f}s + voice {aa:.1f}s -> {target:.1f}s")

list_file = WORK / "concat.txt"
list_file.write_text(
    "\n".join(f"file '{f.name}'" for f in segment_files) + "\n", encoding="utf-8"
)

subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(list_file),
     "-c", "copy", str(OUT)],
    check=True, cwd=str(WORK),
)
total = probe(OUT)
size_mb = OUT.stat().st_size / 1048576
print(f"FINAL: {OUT.relative_to(ROOT)}  {total:.1f}s ({total/60:.1f}min)  {size_mb:.1f}MB")
