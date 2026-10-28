# Gapless MP3 fixture

`gapless.mp3` is a locally generated 0.25-second 440 Hz sine at 44,100 Hz, mono, encoded with FFmpeg 8.0 and libmp3lame 3.100. It contains no speech or vendor media. Its first audio packet reports Skip Samples of 1105; the Xing/Info frame is 417 bytes. It exercises decoding and gapless metadata without a model, download or service.

Generated once with:

```bash
ffmpeg -nostdin -n -v error -f lavfi -i 'sine=frequency=440:sample_rate=44100:duration=0.25' -map_metadata -1 -fflags +bitexact -flags:a +bitexact -c:a libmp3lame -b:a 128k -write_xing 1 -id3v2_version 0 gapless.mp3
```

Tests remove that first frame in a new file to exercise LAME without a header, then replace the signature in another new file for unknown delay. The saved fixture stays unchanged. Synthetic PCM is written at test time. Test work stays under the tool's tests directory and is removed after each case; each CLI test runs a private copy of the entry script, so output screening continues to protect that copy's own directory.
