# notestream

Notestream is a browser-based sheet-music library and practice environment. It turns uploaded PDF or MusicXML-family scores into a canonical EasyScore JSON representation, stores them in an organized library, and renders them as a horizontally continuous practice stream.

This repository contains the Next.js/React frontend. Conversion, authentication, and persistent storage are supplied by external APIs.

## Current capabilities

### Import and library management

- Upload PDF, XML, MusicXML, and MXL files by file picker or drag and drop.
- Submit asynchronous conversion jobs, display progress and stage logs, and save completed EasyScore (`.ezs`) representations.
- Organize scores in nested folders with breadcrumb navigation and expandable trees.
- Create, rename, move, and delete folders and scores, including drag-and-drop moves with circular-folder protection.
- Use authenticated, API-backed storage or a guest library persisted in browser local storage.
- Create an account, sign in/out, restore sessions, and update a profile avatar through the configured API.

The intended conversion pipeline is:

```text
PDF -> Audiveris OMR -> MusicXML -> FastAPI normalization -> EasyScore JSON -> practice UI
```

### Practice rendering

Notestream detects chord/lyric, standard-notation, tablature, hybrid, and unknown documents and selects a renderer for each representation.

- **Standard notation:** continuous VexFlow 5 SVG engraving with multiple parts, staves, and voices; grand-staff connectors; lyrics; clefs, key and time signatures; accidentals; source-directed stems and beams; ties and slurs; barlines; repeats; and volta endings. Rhythmic positions are aligned across voices while preserving absolute event timing and stable source identities.
- **Chord/lyric sheets:** a continuous measure stream with lyrics, beat/strum markers, section labels, and sticky instrument-aware chord diagrams powered by VexChords.
- **Tablature and hybrid scores:** detected and routed independently, with timeline/measure placeholders currently in place. Full notation-quality tab engraving is not yet implemented.
- **Manual navigation:** the practice stream can be dragged horizontally, with stationary signature context retained for standard notation.

### Playback and feedback

- Play, pause, reset, and scrub a score from a tempo-controlled musical transport.
- Derive timing from canonical ticks (`480` ticks per quarter note), event starts/durations, and each measure's actual time signature rather than SVG coordinates.
- Highlight all active non-rest notes across simultaneous voices and staves without redrawing the score on every animation frame.
- Auto-scroll the continuous score from the same monotonic transport clock used for note activity.
- Choose silent highlighting, an accented metronome based on the score's beat unit, or synthesized piano-note playback; control tempo and volume from the practice console.
- Resolve repeat signs and alternate endings into playback order, presented either as expanded inline repeats or as jumps within the printed layout.
- Optionally enable score-guided microphone detection. The detector checks expected pitches and timing near the current cursor, handles simultaneous chord tones, and reports accuracy, tonality, timing, missed notes, and nearby mistakes.

Microphone detection is deliberately constrained: it does not transcribe arbitrary audio, follow the performer autonomously, or advance the cursor. It requires browser permission and a secure context (`https://` or `localhost`).

## Architecture

- **Next.js 16, React 19, and TypeScript** provide the application shell, library, upload workflow, and practice dashboard.
- **VexFlow 5 and VexChords** render standard notation and chord diagrams.
- A renderer selector and canonical EasyScore types keep sheet-type handling separate.
- Pure timing, signature, playback, repeat-resolution, layout, and detection modules keep musical state independent of engraving.
- A rendered-note registry maps canonical event identities to VexFlow SVG groups for direct highlighting.
- The Web Audio API provides metronome and piano output; an AudioWorklet supplies overlapping microphone frames to a score-guided harmonic detector.
- Vitest covers timing, layout, notation metadata, rendered-note mapping, playback, repeat traversal, and audio detection/scoring logic.

## Running locally

Requirements:

- Node.js 20 or newer
- npm
- Compatible conversion and application APIs

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Set `NEXT_PUBLIC_API_URL` to the API origin used for conversion, authentication, and score storage. Without configured backend services, the frontend and guest library can load, but uploads and authenticated operations will not be fully functional.

Available validation commands:

```bash
npm test
npm run lint
npx tsc --noEmit
npm run build
```

## Project status

Notestream is an active prototype. Standard notation, chord/lyric practice, transport playback, repeat presentation, and score-guided microphone feedback are implemented in the current frontend. Conversion and account persistence still depend on separately deployed services, tablature/hybrid engraving remains preliminary, and microphone analysis is intended as practice feedback rather than production-grade transcription.
