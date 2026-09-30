"""Resolve a public YouTube video and create a bounded, silent H.264 clip."""
import json
import math
import os
import subprocess
import sys
from urllib.parse import urlparse


class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


def fail(code, message):
    print(json.dumps({"code": code, "message": message}, ensure_ascii=False))
    sys.exit(1)


def main():
    try:
        import yt_dlp
    except ImportError:
        fail("DEPENDENCY", "YouTube取得の準備が必要です。READMEのセットアップ手順を実行してください。")
    url, start, length, output, node_path = sys.argv[1:]
    start, length = int(start), int(length)
    try:
        with yt_dlp.YoutubeDL({
            "quiet": True, "no_warnings": True, "logger": QuietLogger(),
            "noplaylist": True, "cachedir": False, "socket_timeout": 15,
            "retries": 1, "extractor_retries": 1,
            "js_runtimes": {"node": {"path": node_path}},
        }) as downloader:
            info = downloader.extract_info(url, download=False)
    except Exception:
        fail("UNAVAILABLE", "YouTubeから動画を取得できませんでした。非公開・年齢制限・地域制限・取得制限のある動画は使えません。動画ファイルを選択してください。")
    if not info or info.get("is_live") or info.get("live_status") in ("is_live", "is_upcoming"):
        fail("LIVE", "ライブ配信は解析できません。録画済みの動画を選んでください。")
    duration = info.get("duration")
    if not isinstance(duration, (int, float)) or not math.isfinite(duration) or start + length > duration:
        fail("RANGE", "指定した区間が動画の長さを超えています。開始位置と長さを変更してください。")
    formats = []
    for f in info.get("formats", []):
        host = urlparse(f.get("url", "")).hostname or ""
        if (f.get("ext") == "mp4" and f.get("vcodec", "none") != "none"
                and 0 < (f.get("height") or 0) <= 720 and not f.get("has_drm")
                and f.get("protocol") == "https"
                and urlparse(f.get("url", "")).scheme == "https"
                and host.endswith(".googlevideo.com")):
            formats.append(f)
    if not formats:
        fail("FORMAT", "取得できる動画形式がありません。動画ファイルを選択してください。")
    selected = max(formats, key=lambda f: (f.get("height") or 0, f.get("vcodec", "").startswith("avc1"), f.get("tbr") or 0))
    try:
        completed = subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-nostdin", "-y",
            "-rw_timeout", "15000000", "-protocol_whitelist", "https,tls,tcp",
            "-ss", str(start), "-i", selected["url"], "-t", str(length),
            "-map", "0:v:0", "-an", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "23", "-pix_fmt", "yuv420p", "-r", "30",
            "-movflags", "+faststart", "-fs", "104857600", output,
        ], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, timeout=90)
    except FileNotFoundError:
        fail("DEPENDENCY", "FFmpegが必要です。READMEのセットアップ手順を確認してください。")
    except subprocess.TimeoutExpired:
        fail("TIMEOUT", "動画の取得がタイムアウトしました。短い区間で再試行するか、動画ファイルを選択してください。")
    if completed.returncode or not os.path.exists(output) or os.path.getsize(output) < 100:
        fail("DOWNLOAD", "動画を取得できませんでした。時間をおいて再試行するか、動画ファイルを選択してください。")
    if os.path.getsize(output) >= 104857600:
        fail("SIZE", "動画が100MBを超えました。区間を短くしてください。")


if __name__ == "__main__":
    main()
