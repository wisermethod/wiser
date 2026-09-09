---
name: google-vision
type: connector
category: media
description: Detects faces and returns eye coordinates for faces with both eyes available
version: 0.1.0
---

# Google Vision

Detects faces and returns eye coordinates for faces with both eyes available.

## Status

Shipped 2026-09-08. Live connect 2026-09-08: `images` ACTIVE. `detect_faces` not run (billed; needs an image). Fake-provider tests still run. See `auth.md` and [gateway setup](../../gateway/SETUP.md).

## Reaching it

Through the gateway by action id. Input fields are declared in `manifest.json`.

```
google-vision.images.detect_faces  { image_base64?, image_uri? }  confirmation: once
```

Supply exactly one of `image_base64` or `image_uri`. The module requests FACE_DETECTION with at most 10 faces and returns `{ count, faces: [{ confidence, left_eye: { x, y }, right_eye: { x, y } }] }`. Coordinates are pixels in the submitted image. A face lacking either eye is omitted and not counted. The caller downscales before the call. Google documents 1600x1200 pixels as a face-detection recommendation, not a ceiling; its 75,000,000-pixel limit is for OCR. Images must stay within the documented 20 MB file and 10 MB JSON limits. See [supported files](https://docs.cloud.google.com/vision/docs/supported-files), checked 2026-09-08.

## Credentials

This connector holds no credential. Each grant lives with the gateway's provider and is made in your browser. There is no credential file in this directory.

## Modules

| Module | Privilege | Actions |
|--------|-----------|---------|
| `images` | read | `detect_faces` |

Each module has its own grant. Privilege describes the grant, not just these actions.

## Destructive Actions

| Action | Effect | Confirmation |
|--------|--------|--------------|
| `images.detect_faces` | Run billed face detection | once |

Spent credits cannot be recovered by this connector.

## Troubleshooting

`needs_connect`: connect the named module in its own human turn using `auth.md`.

`needs_confirmation`: review the action and input, then repeat with `confirm: true` if intended.

`vendor_error`: inspect the safe status and endpoint, then check access, input, and quota at the platform. Do not paste a raw vendor error body into chat.

## Reference

- How to connect: [auth.md](auth.md)
- Gateway setup: [gateway/SETUP.md](../../gateway/SETUP.md)
- Platform reference: https://cloud.google.com/vision/docs/detecting-faces
