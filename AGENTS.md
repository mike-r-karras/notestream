# Notestream project handoff

## Read this first

This repository is the source of truth. Inspect the current checkout, existing
types, scripts, tests, and Git history before proposing or making changes. Do
not assume that files from earlier experiments are still present.

The repository has been reverted to the last commit before the recent
practice-playback experiment. Treat that reverted playback implementation as
discarded—not as the current architecture and not as a patch to reconstruct
blindly.

Preserve unrelated user changes. Prefer narrow, reviewable edits over replacing
whole renderer files. Before editing, identify the smallest ownership boundary
for the behavior. After editing, inspect the complete Git diff for accidental
notation or layout changes.

## Product direction

Notestream turns uploaded sheet music into an interactive learning and practice
experience. The current conversion path is:

1. PDF sheet music
2. Audiveris optical music recognition
3. MusicXML
4. FastAPI parser/normalizer
5. Canonical Notestream/EasyScore JSON
6. React + TypeScript practice UI
7. VexFlow 5 notation rendering

PDF-to-MusicXML/EasyScore conversion is foundational, not the final product.
Longer-term practice features include note-following, fingering suggestions,
chord names, Roman-numeral analysis, difficulty ratings, practice loops,
alternate voicings, and transposition.

Preserve useful source artifacts and provenance where the existing system
supports them: original PDF, MusicXML, normalized JSON, converter/schema
versions, warnings, and stable source IDs.

## Sheet types and practice rendering

Practice mode must distinguish at least:

- chord/lyric sheets
- standard notation scores
- tablature

Select the appropriate parser and renderer for the detected sheet type.
Practice content should render as a horizontally continuous stream rather than
as paginated pages, so it can move past a stable viewing area during practice.

Standard notation uses a continuous VexFlow SVG renderer. The known-good
architecture is modular and source-driven. It supports a grand staff, multiple
staves and voices, aligned rhythmic positions across hands, absolute event
starts, and real staff connectors. Source notation metadata controls written
stems, beams, ties, slurs, accidentals, barlines, repeat signs, final barlines,
and volta endings.

Do not duplicate or heuristically reconstruct notation metadata that already
exists in the normalized score. Do not mutate source measures to support
playback.

## Musical timing model

Musical timing is authoritative and independent of VexFlow engraving.

- `TICKS_PER_QUARTER = 480`.
- Event start ticks and duration ticks derive from the canonical score timing,
  not from rendered x coordinates.
- Engraved x positions are a view of musical time, not the source of musical
  time.
- A measure duration must come from its actual time signature and event timing,
  not from a hard-coded four-beat assumption.
- A metronome beat unit comes from the time-signature denominator. For example,
  in 3/8 an eighth-note beat is 240 ticks, there are three such beats per
  measure, and the downbeat accent repeats every three beats.
- Note highlighting is independent of metronome clicks. Every non-rest event in
  every voice and staff must be active during its own absolute interval:
  `startTick <= currentTick < startTick + durationTicks`.
- Chords and simultaneous notes in both hands can be active together.
- Short notes between metronome beats must still highlight at their own times.

Preserve absolute event starts in sequential VexFlow voices with the existing
gap/`GhostNote` strategy where applicable.

## Repeats and endings

Written notation order and playback order are separate concepts.

The renderer should continue to display repeat signs and volta endings from the
source score. Playback traversal is not part of the first playback milestone.
Initially, play measures once in written order.

Future repeat support must be implemented as a separate `PlaybackResolver` (or
equivalent) that derives a playback sequence from immutable written measures.
It must support two eventual presentation modes:

1. Expanded/virtual-repeat mode: render repeated passages inline in playback
   order, mark first/second/nth endings, and optionally show ghosted repeat
   signs as reminders of the printed source.
2. Printed-score mode: preserve the original layout and quickly scroll or jump
   back to the correct repeat start during playback.

Do not mix repeat traversal into the notation parser or mutate the source score.

## Renderer regression history

Notation rendering has been fragile. Previous broad edits caused:

- accidentals appearing as stems
- accidental spacing pushing notes into the following measure
- stems attaching to the wrong notes
- crossing or incorrectly positioned ties
- lost ties
- incorrect beam/stem inference
- layout and spacing regressions while adding unrelated behavior

Consequently:

- Treat the current committed renderer as the visual baseline.
- Capture or run an existing representative score before changing it.
- Keep playback state and transport logic outside engraving logic where
  practical.
- Add only the minimum renderer hook needed to associate canonical note events
  with their rendered SVG elements.
- Never replace a stable renderer wholesale to add playback.
- Compare representative output before and after the change.
- If a renderer change alters notation when playback is idle, treat that as a
  regression unless explicitly required.

## Current task: first practice-playback milestone

Rebuild playback from the current repository state—not from the reverted
experiment.

Required behavior:

- Make the existing playback button play/pause the current standard-notation
  score in written order.
- Do not synthesize or play the musical notes.
- Emit a short metronome tone for each beat using the score's actual time
  signature and beat unit.
- Accent the first beat of each measure.
- Use the existing tempo control.
- Drive the transport from one monotonic musical clock and avoid accumulated
  `setInterval` drift.
- Highlight every currently active non-rest note in both hands and all voices.
- Active notation should be blue with a visible emitted blue glow.
- Pausing may retain the current highlight; reset must clear playback position,
  highlight, metronome state, and scroll position.
- Synchronize existing auto-scroll to the transport without tying event timing
  to x-coordinate interpolation.
- Do not implement repeat/ending traversal in this milestone.

Important lesson from the reverted attempt: it mostly ran, but its metronome was
hard-coded as 4/4 even for a 3/8 score, and highlighting effectively caught only
notes aligned with metronome beats. The replacement must model metronome events
and note-active intervals as separate consumers of the same transport clock.

## Expected implementation boundaries

Confirm actual names and locations in the repository before using these
conceptual boundaries:

- **Score timing adapter:** converts canonical measures/events into absolute
  transport ticks while preserving staff, voice, source ID, start, and duration.
- **Practice transport:** owns play, pause, reset, tempo, monotonic elapsed time,
  current tick, and completion.
- **Metronome scheduler:** derives measure-local beat boundaries and accents from
  time signatures; it does not decide which notes are active.
- **Rendered-note registry:** maps canonical source event IDs (or a stable
  compound identity) to the actual VexFlow SVG groups after drawing.
- **Playback highlighter:** applies/removes playback classes based on active note
  intervals without redrawing the entire score on animation frames.
- **Scroll synchronizer:** maps the current transport tick to the existing
  continuous layout.

Prefer stable event/source IDs over positional guesses. If the score lacks an ID
needed for mapping, trace and repair that identity at the narrowest appropriate
layer rather than matching notes by SVG order.

## Required working procedure

Before changing code:

1. Run `git status` and identify the exact baseline commit.
2. Read repository-level and nested `AGENTS.md` files.
3. Locate the practice page, renderer selector, continuous notation renderer,
   canonical score types, timing helpers, and existing playback controls.
4. Trace one representative 3/8 measure from normalized JSON through timeline,
   transport, renderer, and SVG output.
5. Explain the causes of the current missing behavior and propose the smallest
   change set.
6. Identify existing tests/build commands from `package.json` and repository
   documentation.

While implementing:

1. Keep the transport/time-signature logic testable without a browser or
   VexFlow.
2. Add focused tests for at least 4/4 and 3/8, including eighth/sixteenth-note
   events between metronome beats, chords, simultaneous hands, rests, and a
   time-signature change if the schema supports it.
3. Avoid per-animation-frame React rerenders of the entire VexFlow score.
4. Do not change notation layout, spacing, stem, beam, accidental, tie, slur,
   repeat, or ending behavior unless a demonstrated mapping hook requires a
   narrowly scoped change.

Before finishing:

1. Run the repository's TypeScript checker, tests, linter, and production build
   that are relevant and available.
2. Inspect the complete Git diff.
3. Verify idle rendering is visually unchanged on a representative score.
4. Manually verify playback at minimum on one 4/4 score and the known 3/8 score.
5. Report commands run, results, remaining limitations, and every modified file.
6. Do not claim success if full validation could not run; state the blocker.

