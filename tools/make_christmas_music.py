"""Build the small public-domain Jingle Bells music-box loop used by the site."""

from __future__ import annotations

import math
import wave
from pathlib import Path

import numpy as np


RATE = 44_100
BPM = 132
BEAT = 60 / BPM
OUTPUT = Path(__file__).resolve().parents[1] / "assets" / "christmas" / "jingle-bells.wav"

FREQUENCIES = {
    "C4": 261.63,
    "D4": 293.66,
    "E4": 329.63,
    "F4": 349.23,
    "G4": 392.00,
    "A4": 440.00,
    "Bb4": 466.16,
    "C5": 523.25,
    "D5": 587.33,
    "E5": 659.25,
}

# Traditional / public-domain melody: Jingle Bells (chorus).
MELODY = [
    ("E4", 1), ("E4", 1), ("E4", 2),
    ("E4", 1), ("E4", 1), ("E4", 2),
    ("E4", 1), ("G4", 1), ("C4", 1.5), ("D4", .5), ("E4", 4),
    ("F4", 1), ("F4", 1), ("F4", 1.5), ("F4", .5), ("F4", 1),
    ("E4", 1), ("E4", 1), ("E4", .5), ("E4", .5),
    ("D4", 1), ("D4", 1), ("E4", 1), ("D4", 2), ("G4", 2),
    ("E4", 1), ("E4", 1), ("E4", 2),
    ("E4", 1), ("E4", 1), ("E4", 2),
    ("E4", 1), ("G4", 1), ("C4", 1.5), ("D4", .5), ("E4", 4),
    ("F4", 1), ("F4", 1), ("F4", 1), ("F4", 1),
    ("F4", 1), ("E4", 1), ("E4", 1), ("E4", .5), ("E4", .5),
    ("G4", 1), ("G4", 1), ("F4", 1), ("D4", 1), ("C4", 4),
]

CHORDS = [
    (("C4", "E4", "G4"), 8),
    (("C4", "E4", "G4"), 8),
    (("F4", "A4", "C5"), 8),
    (("C4", "E4", "G4"), 8),
    (("G4", "Bb4", "D4"), 8),
    (("C4", "E4", "G4"), 8),
    (("C4", "E4", "G4"), 8),
    (("F4", "A4", "C5"), 8),
]


def bell(frequency: float, duration: float) -> np.ndarray:
    count = max(1, int(duration * RATE))
    t = np.arange(count) / RATE
    envelope = np.exp(-3.4 * t / max(duration, .1)) * np.minimum(1, t * 42)
    tone = (
        np.sin(2 * math.pi * frequency * t)
        + .38 * np.sin(2 * math.pi * frequency * 2.01 * t)
        + .17 * np.sin(2 * math.pi * frequency * 3.98 * t)
    )
    return tone * envelope


def pad(notes: tuple[str, ...], duration: float) -> np.ndarray:
    count = max(1, int(duration * RATE))
    t = np.arange(count) / RATE
    attack = np.minimum(1, t / .35)
    release = np.minimum(1, (duration - t) / .8)
    envelope = np.maximum(0, np.minimum(attack, release))
    out = np.zeros(count)
    for note in notes:
        frequency = FREQUENCIES[note] / 2
        out += np.sin(2 * math.pi * frequency * t) + .22 * np.sin(2 * math.pi * frequency * 2 * t)
    return out * envelope / len(notes)


def place(track: np.ndarray, sample: np.ndarray, start: int, volume: float) -> None:
    end = min(len(track), start + len(sample))
    if end > start:
        track[start:end] += sample[: end - start] * volume


def build() -> None:
    melody_beats = sum(beats for _, beats in MELODY)
    duration = melody_beats * BEAT + 1.8
    track = np.zeros(int(duration * RATE))

    beat_cursor = 0.0
    for note, beats in MELODY:
        note_duration = beats * BEAT
        place(track, bell(FREQUENCIES[note], note_duration * .94 + .32), int(beat_cursor * BEAT * RATE), .28)
        beat_cursor += beats

    beat_cursor = 0.0
    for notes, beats in CHORDS:
        if beat_cursor >= melody_beats:
            break
        chord_beats = min(beats, melody_beats - beat_cursor)
        place(track, pad(notes, chord_beats * BEAT), int(beat_cursor * BEAT * RATE), .11)
        beat_cursor += chord_beats

    # Gentle sleigh-bell sparkle on the first beat of each bar.
    rng = np.random.default_rng(1224)
    for beat in np.arange(0, melody_beats, 3):
        count = int(.16 * RATE)
        t = np.arange(count) / RATE
        sparkle = rng.normal(0, 1, count) * np.exp(-25 * t)
        place(track, sparkle, int(beat * BEAT * RATE), .022)

    peak = max(.001, float(np.max(np.abs(track))))
    pcm = np.int16(np.clip(track / peak * .82, -1, 1) * 32767)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(OUTPUT), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(pcm.tobytes())
    print(OUTPUT)


if __name__ == "__main__":
    build()
