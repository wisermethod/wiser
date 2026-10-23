"""Local decode and encode. Provider output is never copied into errors or logs."""
import importlib.metadata
import json
import shutil
import subprocess
from pathlib import Path

from paths import CaptureError


def dependency(name):
    flag = "--version" if name == "tesseract" else "-version"
    try:
        if not shutil.which(name):
            raise OSError()
        result = subprocess.run([name, flag], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        if result.returncode:
            raise OSError()
        return (result.stdout or result.stderr).splitlines()[0]
    except OSError:
        raise CaptureError("missing " + name + "; check: " + name + " " + flag + ". Make that check pass and retry") from None


def versions(video):
    values = {"pyobjc": importlib.metadata.version("pyobjc-core"), "tesseract": dependency("tesseract")}
    values["ffmpeg"] = dependency("ffmpeg") if video else None
    return values


def run(arguments, operation):
    try:
        result = subprocess.run(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except OSError:
        raise CaptureError(operation + " could not start; check ffmpeg -version and ffprobe -version") from None
    if result.returncode:
        raise CaptureError(operation + " failed; check the input format, work directory permissions and available disk space")
    return result.stdout


def decode(path, directory, fps=None):
    directory.mkdir()
    rate = ["-vf", "fps=" + str(fps), "-fps_mode", "cfr"] if fps is not None else ["-fps_mode", "passthrough"]
    run(["ffmpeg", "-nostdin", "-v", "error", "-protocol_whitelist", "file,pipe", "-i", str(path),
         *rate, str(directory / "f%05d.png")], "video decode")
    files = sorted(directory.glob("f*.png"))
    if not files:
        raise CaptureError("video decoded to zero frames; check its duration and --fps")
    return files


def colour_tags(path):
    data = json.loads(run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                           "stream=color_space,color_transfer,color_primaries", "-of", "json", str(path)],
                          "colour-tag readback"))
    stream = data.get("streams", [{}])[0]
    return {key: stream.get(key, "unknown") for key in ("color_space", "color_transfer", "color_primaries")}


def encode(directory, output, fps):
    run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-framerate", str(fps),
         "-i", str(directory / "f%05d.png"), "-vf", "pad=ceil(iw/2)*2:ceil(ih/2)*2,setsar=1,format=yuv420p",
         "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-g", "15", "-bf", "2",
         "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
         "-movflags", "+faststart", str(output)], "video encode")
    tags = colour_tags(output)
    retagged = any(tags[key] != "bt709" for key in ("color_transfer", "color_primaries"))
    if retagged:
        tagged = output.with_name(output.stem + "-tagged.mp4")
        try:
            run(["ffmpeg", "-nostdin", "-v", "error", "-y", "-i", str(output), "-map", "0:v:0", "-c", "copy",
                 "-bsf:v", "h264_metadata=colour_primaries=1:transfer_characteristics=1:matrix_coefficients=1",
                 "-movflags", "+faststart", str(tagged)], "colour re-tag")
            tagged.replace(output)
            tags = colour_tags(output)
        finally:
            tagged.unlink(missing_ok=True)
    return {**tags, "retagged": retagged}
