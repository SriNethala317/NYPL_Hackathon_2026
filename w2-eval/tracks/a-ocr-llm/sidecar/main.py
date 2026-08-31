"""
The OCR sidecar: PP-OCR models over HTTP, on hardware you control.

    .venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000

`--host 0.0.0.0`, not `127.0.0.1`. A phone on the same network reaches this by the desktop's LAN
address, and a service bound to loopback is invisible to it — the same trap the app's README
already documents for the Expo QR code showing 127.0.0.1.

## Why this exists at all

Expo Go cannot run OCR on the device: iOS Vision and Android ML Kit need native modules, and
tesseract.js cannot run on Hermes. So every reader this project can use is a network call, and the
only question is *whose* network. This one is yours. It is the only OCR path where a tax document
never reaches a third party, which is the whole of Track A's argument now that on-device is off
the table.

## Why RapidOCR rather than the paddleocr package

Same PP-OCR models, running on ONNX Runtime instead of PaddlePaddle. PaddlePaddle publishes no
wheel for the Python 3.14 on this machine; RapidOCR installs cleanly, loads in under a second, and
serves `PP-OCRv6_rec_small`. That model matters: on a published hallucination benchmark PP-OCRv6
scores 93.2% against Qwen3-VL-235B's 80.6%, with roughly 6800x fewer parameters. A recogniser that
cannot invent a plausible number is the point of this track.

## CPU only, deliberately

The GPU on this machine is a 4 GB card already committed to the local vision model, and ollama was
measured trying to allocate 4295 MiB on it and falling back to CPU entirely. PP-OCR models are
small enough that CPU is unremarkable — about three seconds a page — and two processes fighting
over one small card is slower than either alone.
"""

from __future__ import annotations

import base64
import binascii
import io
import time
from typing import Any

import numpy as np
from fastapi import FastAPI, HTTPException
from PIL import Image
from pydantic import BaseModel
from rapidocr import RapidOCR

app = FastAPI(title="w2-eval OCR sidecar")

# Loaded once at import. The first request would otherwise pay for everyone else's model load and
# look like the slowest page in the corpus, which is a measurement artefact rather than a fact
# about the document.
_engine = RapidOCR()


class OcrRequest(BaseModel):
    """A base64 image. No filename, no path — this service never touches the filesystem."""

    image_base64: str


class OcrLine(BaseModel):
    text: str
    # Axis-aligned bounds, which is all the parser needs. The underlying quadrilateral survives in
    # `quad` for anything that later cares about rotation.
    x: float
    y: float
    w: float
    h: float
    confidence: float
    quad: list[list[float]]


class OcrResponse(BaseModel):
    lines: list[OcrLine]
    width: int
    height: int
    ms: int
    engine: str
    # Mean ink coverage of the page, 0-1. Cheap, and the basis of blank-region detection.
    ink: float


def _decode(image_base64: str) -> Image.Image:
    """Base64 to an RGB image, with the two failure modes reported distinctly."""
    payload = image_base64.split(",", 1)[-1]  # tolerate a data: URI prefix
    try:
        raw = base64.b64decode(payload, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(status_code=400, detail=f"not valid base64: {exc}") from exc

    try:
        return Image.open(io.BytesIO(raw)).convert("RGB")
    except Exception as exc:  # noqa: BLE001 - Pillow raises a wide variety here
        raise HTTPException(status_code=400, detail=f"not a readable image: {exc}") from exc


def _ink_fraction(image: Image.Image) -> float:
    """
    Fraction of pixels dark enough to be ink.

    The measurement the whole blank-detection idea rests on: whether a box is empty is a property
    of the pixels, not an opinion a model gets to hold. Otsu would adapt better to a dim capture,
    but a fixed threshold is honest about what it is and has no failure mode of its own.
    """
    grey = np.asarray(image.convert("L"), dtype=np.uint8)
    return float((grey < 160).mean())


@app.get("/health")
def health() -> dict[str, Any]:
    """Enough to tell 'not running' from 'running but broken' without sending an image."""
    return {"ok": True, "engine": "rapidocr/PP-OCRv6"}


@app.post("/ocr", response_model=OcrResponse)
def ocr(request: OcrRequest) -> OcrResponse:
    image = _decode(request.image_base64)

    started = time.monotonic()
    result = _engine(np.asarray(image))
    elapsed = int((time.monotonic() - started) * 1000)

    lines: list[OcrLine] = []

    # RapidOCR returns line regions rather than individual words, which is a gift: the hardest part
    # of reading a form from loose words -- deciding which of them belong on a line together -- is
    # already done, and done by something that can see the pixels.
    boxes = getattr(result, "boxes", None)
    texts = getattr(result, "txts", None)
    scores = getattr(result, "scores", None)

    if boxes is not None and texts is not None:
        for quad, text, score in zip(boxes, texts, scores):
            xs = [float(p[0]) for p in quad]
            ys = [float(p[1]) for p in quad]
            lines.append(
                OcrLine(
                    text=str(text),
                    x=min(xs),
                    y=min(ys),
                    w=max(xs) - min(xs),
                    h=max(ys) - min(ys),
                    confidence=float(score),
                    quad=[[float(p[0]), float(p[1])] for p in quad],
                )
            )

    return OcrResponse(
        lines=lines,
        width=image.width,
        height=image.height,
        ms=elapsed,
        engine="rapidocr/PP-OCRv6",
        ink=_ink_fraction(image),
    )
