"use client";

import { useEffect, useState, useRef } from "react";
// @ts-ignore
import { ChordBox } from "vexchords";
import { DEFAULT_SONG_JSON, DEFAULT_INSTRUMENT_JSON } from "./defaultData";

export default function Sandbox() {
  // Interpreter and Instrument selections
  const [interpreter, setInterpreter] = useState("chords/vocals");
  const [instrument, setInstrument] = useState("ukulele");

  // Editable JSON states (current input value)
  const [songJson, setSongJson] = useState(DEFAULT_SONG_JSON);
  const [instJson, setInstJson] = useState(DEFAULT_INSTRUMENT_JSON);

  // Original states (saved checkpoints) for the revert functionality
  const [songJsonOriginal, setSongJsonOriginal] = useState(DEFAULT_SONG_JSON);
  const [instJsonOriginal, setInstJsonOriginal] = useState(DEFAULT_INSTRUMENT_JSON);

  // Parsing error states
  const [songError, setSongError] = useState<string | null>(null);
  const [instError, setInstError] = useState<string | null>(null);

  // Saved success indicators
  const [songSaved, setSongSaved] = useState(false);
  const [instSaved, setInstSaved] = useState(false);

  // Parsed objects for rendering
  const [parsedSong, setParsedSong] = useState<any>(null);
  const [parsedInst, setParsedInst] = useState<any>(null);

  // Flattened measures list for horizontal rendering
  const [flattenedMeasures, setFlattenedMeasures] = useState<any[]>([]);

  // Horizontal drag offset states
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; offset: number }>({ x: 0, offset: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Parse and load default data on mount
  useEffect(() => {
    try {
      const song = JSON.parse(DEFAULT_SONG_JSON);
      setParsedSong(song);
      flattenSongMeasures(song);
    } catch (e) {
      console.error("Error parsing default song", e);
    }
    try {
      const inst = JSON.parse(DEFAULT_INSTRUMENT_JSON);
      setParsedInst(inst);
    } catch (e) {
      console.error("Error parsing default instrument", e);
    }
  }, []);

  // Helper to flatten sections and measures into a linear array
  const flattenSongMeasures = (song: any) => {
    if (!song || !song.sections) {
      setFlattenedMeasures([]);
      return;
    }
    const list: any[] = [];
    let absoluteIndex = 0;
    let lastChordSymbol = "";

    song.sections.forEach((section: any) => {
      if (section.measures && section.measures.length > 0) {
        section.measures.forEach((measure: any, mIdx: number) => {
          const chordSymbol = measure.chords?.[0]?.symbol || "";
          let showChordBox = false;

          // If a chord is defined in this measure, check if it's a new chord
          // or a repetition of the same chord as the previous measure
          if (chordSymbol) {
            if (chordSymbol !== lastChordSymbol) {
              showChordBox = true;
              lastChordSymbol = chordSymbol;
            }
          }

          list.push({
            ...measure,
            sectionId: section.id,
            sectionLabel: mIdx === 0 ? section.label : null, // only first measure gets section label
            absoluteIndex: absoluteIndex++,
            showChordBox, // store visibility state to hide duplicate subsequent chordboxes
          });
        });
      }
    });
    setFlattenedMeasures(list);
    setOffsetX(0); // Reset drag scroll offset when song changes
  };

  // Helper function to render vexchords inside all container placeholders
  const renderChordDiagrams = () => {
    if (!parsedInst) return;

    // Find all chord diagram containers
    const containers = document.querySelectorAll(".chord-diagram-container");
    containers.forEach((container: any) => {
      // Clear previous drawing
      container.innerHTML = "";

      const chordSymbol = container.getAttribute("data-chord");
      if (!chordSymbol) return;

      // Look up chord frets in the instrument configuration
      const frets = parsedInst.chords?.[chordSymbol];
      if (frets && Array.isArray(frets)) {
        // Map instrument frets array (e.g. [2, 1, 0, 0]) to vexchords chord array
        // Vexchords uses 1-based indexing for strings [string, fret]
        // Un-mirror chord rendering: map index 0 (leftmost) to string len, and index len-1 (rightmost) to string 1.
        const vexChord: any[] = [];
        const len = frets.length;
        for (let i = 0; i < len; i++) {
          const fretVal = frets[i];
          const stringNum = len - i;
          if (fretVal === -1 || fretVal === "x") {
            vexChord.push([stringNum, "x"]);
          } else {
            vexChord.push([stringNum, fretVal]); // 0 will draw an open circle (open string)
          }
        }

        try {
          // Draw ukulele chord diagram using Vexchords
          // Width & height compressed to remove horizontal padding
          const box = new ChordBox(container, {
            width: 64,
            height: 72,
            numStrings: frets.length || 4,
            numFrets: 5,
            showTuning: false,
            circleRadius: 3, // compact and tight
            defaultColor: "var(--theme-chord-dot)",
            strokeColor: "var(--theme-chord-stroke)",
            textColor: "var(--theme-chord-text)",
          });

          box.draw({
            chord: vexChord,
          });
        } catch (err) {
          console.error("Vexchords render error for chord:", chordSymbol, err);
        }
      }
    });
  };

  // Trigger vexchords re-rendering whenever state changes
  useEffect(() => {
    // Small timeout to ensure DOM nodes are fully mounted
    const timer = setTimeout(() => {
      renderChordDiagrams();
    }, 50);
    return () => clearTimeout(timer);
  }, [flattenedMeasures, parsedInst, offsetX]); // Also re-render/adjust diagrams on scroll!

  // Song Handlers
  const handleSongSave = () => {
    try {
      const parsed = JSON.parse(songJson);
      setParsedSong(parsed);
      flattenSongMeasures(parsed);
      setSongJsonOriginal(songJson);
      setSongError(null);
      setSongSaved(true);
      setTimeout(() => setSongSaved(false), 2000);
    } catch (err: any) {
      setSongError(err.message || "Invalid JSON format");
    }
  };

  const handleSongRevert = () => {
    setSongJson(songJsonOriginal);
    setSongError(null);
  };

  // Instrument Handlers
  const handleInstSave = () => {
    try {
      const parsed = JSON.parse(instJson);
      setParsedInst(parsed);
      setInstJsonOriginal(instJson);
      setInstError(null);
      setInstSaved(true);
      setTimeout(() => setInstSaved(false), 2000);
    } catch (err: any) {
      setInstError(err.message || "Invalid JSON format");
    }
  };

  const handleInstRevert = () => {
    setInstJson(instJsonOriginal);
    setInstError(null);
  };

  // Drag-to-Scroll Event Handlers
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      offset: offsetX,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;

    const deltaX = e.clientX - dragStartRef.current.x;
    let newOffset = dragStartRef.current.offset + deltaX;

    // Calculate boundary limits (measure width is 270px)
    const totalWidth = flattenedMeasures.length * 270;
    const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
    const visibleWidth = Math.max(0, viewportWidth - 150); // 150px for the static clef on the left

    const minOffset = Math.min(0, -(totalWidth - visibleWidth));

    // Boundary snap
    if (newOffset > 0) newOffset = 0;
    if (newOffset < minOffset) newOffset = minOffset;

    setOffsetX(newOffset);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Generate dynamic string label based on tuning configuration
  const getStringLabels = () => {
    if (parsedInst && parsedInst.tuning) {
      return parsedInst.tuning.map((t: string) => t.replace(/\d+/, "")).join(" ");
    }
    return "G C E A";
  };

  return (
    <main className="flex flex-col h-[calc(100vh-64px)] p-6 bg-neutral-950 gap-6 overflow-hidden select-none font-sans">
      {/* Top half container (divided into left and right panes) */}
      <div className="flex flex-1 flex-col md:flex-row gap-6 min-h-0">
        
        {/* Left Pane: Song (JSON) */}
        <div className="flex flex-col flex-1 bg-neutral-900 border border-neutral-800 rounded-xl p-4 min-h-0 shadow-lg">
          {/* Dropdown controls */}
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <label htmlFor="interpreter-select" className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                interpreter
              </label>
              <select
                id="interpreter-select"
                value={interpreter}
                onChange={(e) => setInterpreter(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded px-2 py-1 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="chords">chords</option>
                <option value="chords/vocals">chords/vocals</option>
              </select>
            </div>
            {songSaved && (
              <span className="text-xs text-emerald-400 font-semibold animate-pulse">✓ Saved</span>
            )}
            {songError && (
              <span className="text-xs text-rose-500 font-semibold truncate max-w-[200px]">⚠ Invalid JSON</span>
            )}
          </div>

          {/* Edit Box Label */}
          <div className="mb-2 text-xs font-extrabold text-neutral-300 px-[2.5%] uppercase tracking-wider flex items-center justify-between">
            <span>song (json)</span>
          </div>

          {/* Editable field - centered horizontally taking up 95% width */}
          <div className="flex-1 flex justify-center min-h-0">
            <textarea
              value={songJson}
              onChange={(e) => setSongJson(e.target.value)}
              spellCheck="false"
              className={`w-[95%] h-full min-h-[80px] bg-neutral-950 border text-neutral-200 font-mono text-xs p-3 rounded-lg focus:outline-none focus:ring-1 resize-none overflow-y-auto transition-colors ${
                songError
                  ? "border-rose-800 focus:border-rose-500 focus:ring-rose-500"
                  : "border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-4 mt-3">
            <button
              onClick={handleSongRevert}
              className="px-4 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 tracking-wider transition-all uppercase active:scale-95"
            >
              revert
            </button>
            <button
              onClick={handleSongSave}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-neutral-100 tracking-wider transition-all uppercase active:scale-95"
            >
              save
            </button>
          </div>
        </div>

        {/* Right Pane: Instrument Configuration (JSON) */}
        <div className="flex flex-col flex-1 bg-neutral-900 border border-neutral-800 rounded-xl p-4 min-h-0 shadow-lg">
          {/* Dropdown controls */}
          <div className="flex items-center justify-between mb-3 px-2">
            <div className="flex items-center gap-2">
              <label htmlFor="instrument-select" className="text-xs font-bold tracking-wider text-neutral-400 uppercase">
                instrument
              </label>
              <select
                id="instrument-select"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="bg-neutral-800 border border-neutral-700 text-neutral-200 text-xs font-semibold rounded px-2 py-1 focus:outline-none focus:border-indigo-500 transition-colors cursor-pointer"
              >
                <option value="ukulele">ukulele</option>
              </select>
            </div>
            {instSaved && (
              <span className="text-xs text-emerald-400 font-semibold animate-pulse">✓ Saved</span>
            )}
            {instError && (
              <span className="text-xs text-rose-500 font-semibold truncate max-w-[200px]">⚠ Invalid JSON</span>
            )}
          </div>

          {/* Edit Box Label */}
          <div className="mb-2 text-xs font-extrabold text-neutral-300 px-[2.5%] uppercase tracking-wider flex items-center justify-between">
            <span>instrument configuration (json)</span>
          </div>

          {/* Editable field - centered horizontally taking up 95% width */}
          <div className="flex-1 flex justify-center min-h-0">
            <textarea
              value={instJson}
              onChange={(e) => setInstJson(e.target.value)}
              spellCheck="false"
              className={`w-[95%] h-full min-h-[80px] bg-neutral-950 border text-neutral-200 font-mono text-xs p-3 rounded-lg focus:outline-none focus:ring-1 resize-none overflow-y-auto transition-colors ${
                instError
                  ? "border-rose-800 focus:border-rose-500 focus:ring-rose-500"
                  : "border-neutral-800 focus:border-indigo-500 focus:ring-indigo-500"
              }`}
            />
          </div>

          {/* Action buttons */}
          <div className="flex justify-center gap-4 mt-3">
            <button
              onClick={handleInstRevert}
              className="px-4 py-1.5 rounded bg-neutral-800 hover:bg-neutral-700 text-xs font-semibold text-neutral-300 tracking-wider transition-all uppercase active:scale-95"
            >
              revert
            </button>
            <button
              onClick={handleInstSave}
              className="px-4 py-1.5 rounded bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-neutral-100 tracking-wider transition-all uppercase active:scale-95"
            >
              save
            </button>
          </div>
        </div>

      </div>

      {/* Bottom half: Third Pane */}
      <div className="flex flex-1 flex-col bg-neutral-900 border border-neutral-800 rounded-xl p-4 min-h-0 shadow-lg relative">
        {/* Header */}
        <div className="mb-2 px-2 flex justify-between items-center border-b border-neutral-800 pb-1.5">
          <span className="text-xs font-extrabold tracking-wider text-neutral-300 uppercase">
            rendered songsheet stream
          </span>
          <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 bg-indigo-950/50 border border-indigo-900 px-2.5 py-0.5 rounded-full">
            interactive vexchords view
          </span>
        </div>

        {/* Viewport for SVG: 90% horizontal space, 80% vertical space, centered */}
        <div className="flex-1 flex items-center justify-center min-h-0">
          <div
            ref={viewportRef}
            className="w-[90%] h-[80%] max-h-[350px] bg-neutral-950 border border-neutral-800 rounded-xl relative flex overflow-hidden shadow-inner"
          >
            {parsedSong && parsedInst && flattenedMeasures.length > 0 ? (
              <>
                {/* 1. Static Left Column: Clef, Time Signature, Key Signature */}
                <div className="w-[150px] h-full flex flex-col bg-neutral-950 border-r border-neutral-800/80 shrink-0 z-20 relative select-none">
                  {/* Matching top height spacer (45px) */}
                  <div className="h-[45px]" />

                  {/* Static Staff SVG (135px height) */}
                  <svg className="w-full h-[135px]" viewBox="0 0 150 135" fill="none" xmlns="http://www.w3.org/2000/svg">
                    {/* 5 Staff Lines spaced 15px apart */}
                    <line x1="0" y1="45" x2="150" y2="45" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                    <line x1="0" y1="60" x2="150" y2="60" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                    <line x1="0" y1="75" x2="150" y2="75" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                    <line x1="0" y1="90" x2="150" y2="90" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                    <line x1="0" y1="105" x2="150" y2="105" stroke="var(--theme-staff-muted)" strokeWidth="1" />

                    {/* Treble Clef (𝄞 Unicode, font size to 69px) */}
                    <text
                      x="15"
                      y="96"
                      fontFamily="sans-serif"
                      fontSize="69px"
                      fill="var(--color-indigo-400)"
                      className="font-light select-none drop-shadow-[0_0_4px_rgba(99,102,241,0.4)]"
                    >
                      𝄞
                    </text>

                    {/* Key Signature (Key of A Major: 3 Sharps, 18px size) */}
                    <g fill="var(--color-neutral-400)" fontSize="18px" fontFamily="monospace" fontWeight="bold">
                      {/* F# sharp (top line y = 45) */}
                      <text x="63" y="51">♯</text>
                      {/* C# sharp (third space y = 67.5) */}
                      <text x="78" y="73">♯</text>
                      {/* G# sharp (above top line y = 37.5) */}
                      <text x="93" y="36">♯</text>
                    </g>

                    {/* Time Signature (4/4 stacked, 24px) */}
                    <g fill="var(--theme-chord-text)" fontSize="24px" fontFamily="sans-serif" fontWeight="900" textAnchor="middle">
                      <text x="123" y="70">4</text>
                      <text x="123" y="94">4</text>
                    </g>
                  </svg>

                  {/* Matching bottom lyrics spacer (75px) */}
                  <div className="h-[75px]" />
                </div>

                {/* 2. Draggable Right Column: Song sheet flowing horizontally */}
                <div
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                  onPointerCancel={handlePointerUp}
                  onPointerLeave={handlePointerUp}
                  className="flex-1 h-full select-none cursor-grab active:cursor-grabbing overflow-hidden relative z-10"
                >
                  {/* Moving canvas */}
                  <div
                    style={{
                      transform: `translateX(${offsetX}px)`,
                      transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                    }}
                    className="flex flex-row h-full w-max shrink-0 relative"
                  >
                    {/* Render staves and lyrics */}
                    {flattenedMeasures.map((measure, idx) => {
                      const lyricObj = measure.lyrics?.[0];
                      const lyricText = lyricObj?.text || "";

                      return (
                        <div
                          key={measure.id || idx}
                          style={{ width: "270px" }}
                          className="h-full flex flex-col shrink-0 relative border-r border-neutral-900 select-none"
                        >
                          {/* Floating Section Label Badge */}
                          {measure.sectionLabel && (
                            <div className="absolute top-1.5 left-3 z-30 bg-indigo-950/70 border border-indigo-800/80 text-[10px] text-indigo-300 font-extrabold tracking-widest px-2 py-0.5 rounded uppercase select-none">
                              {measure.sectionLabel}
                            </div>
                          )}

                          {/* Top Portion: Spacer (45px) */}
                          <div className="h-[45px] w-full relative select-none" />

                          {/* Middle Portion: Staff Lines & Strum Hash Marks */}
                          <svg className="w-full h-[135px]" viewBox="0 0 270 135" fill="none" xmlns="http://www.w3.org/2000/svg">
                            {/* 5 Staff Lines */}
                            <line x1="0" y1="45" x2="270" y2="45" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                            <line x1="0" y1="60" x2="270" y2="60" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                            <line x1="0" y1="75" x2="270" y2="75" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                            <line x1="0" y1="90" x2="270" y2="90" stroke="var(--theme-staff-muted)" strokeWidth="1" />
                            <line x1="0" y1="105" x2="270" y2="105" stroke="var(--theme-staff-muted)" strokeWidth="1" />

                            {/* Strum Hash Marks on the second line from bottom (Line 4 at y = 90) */}
                            {Array.from({ length: measure.beats || 4 }).map((_, bIdx) => {
                              const beatWidth = 270 / (measure.beats || 4);
                              const x = beatWidth * bIdx + beatWidth / 2;
                              return (
                                <line
                                  key={bIdx}
                                  x1={x - 8}
                                  y1="98"
                                  x2={x + 8}
                                  y2="82"
                                  stroke="var(--color-indigo-400)"
                                  strokeWidth="3.5"
                                  strokeLinecap="round"
                                  className="drop-shadow-[0_0_2px_rgba(129,140,248,0.6)]"
                                />
                              );
                            })}

                            {/* Standard measure vertical barline at the right boundary */}
                            <line
                              x1="270"
                              y1="45"
                              x2="270"
                              y2="105"
                              stroke={idx === flattenedMeasures.length - 1 ? "var(--color-indigo-400)" : "var(--theme-staff-muted)"}
                              strokeWidth={idx === flattenedMeasures.length - 1 ? "4" : "1"}
                            />
                            {idx === flattenedMeasures.length - 1 && (
                              <line x1="261" y1="45" x2="261" y2="105" stroke="var(--color-indigo-400)" strokeWidth="1" />
                            )}
                          </svg>

                          {/* Bottom Portion: Lyrics centered */}
                          <div className="h-[75px] w-full flex items-center justify-center px-2 text-center select-none">
                            {lyricText ? (
                              <span className="text-[16px] text-neutral-300 font-semibold tracking-wide leading-snug">
                                {lyricText}
                              </span>
                            ) : (
                              <span className="text-[14px] text-neutral-700 italic select-none">...</span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {/* 
                      3. Dynamic Floating & Sticky Chordbox Layers.
                      They sit absolutely overlayed inside the canvas frame, moving withoffsetX.
                      But their horizontal coordinates (left style) are calculated dynamically:
                      x_pos = Math.max(x_normal, Math.min(x_sticky, x_push_limit))
                    */}
                    {flattenedMeasures.map((measure, idx) => {
                      const chordObj = measure.chords?.[0];
                      const chordSymbol = chordObj?.symbol || "";
                      
                      // Only render if a chord box belongs on this measure in the flattened song sequence
                      if (!chordSymbol || !measure.showChordBox) return null;

                      // 1. Normal left position of the box inside the measure (12px padding offset)
                      const x_normal = idx * 270 + 12;

                      // 2. Find index of next measure that defines a chordbox
                      let next_m = flattenedMeasures.length;
                      for (let i = idx + 1; i < flattenedMeasures.length; i++) {
                        if (flattenedMeasures[i].showChordBox) {
                          next_m = i;
                          break;
                        }
                      }

                      // 3. The coordinate boundary limits
                      // x_push_limit is where the next chordbox collides with this one and pushes it left out of view
                      // We subtract chordbox width (74px) and right/left padding buffer
                      const x_push_limit = next_m * 270 - 74 - 12;

                      // x_sticky is the dynamic viewport-relative sticky left edge translated to canvas coordinate space
                      const x_sticky = 12 - offsetX;

                      // Apply the unified clamping equation:
                      const x_pos = Math.max(x_normal, Math.min(x_sticky, x_push_limit));

                      return (
                        <div
                          key={`sticky-chordbox-${measure.id || idx}`}
                          style={{
                            position: "absolute",
                            left: `${x_pos}px`,
                            top: "10px",  // Elevated so bottom is at 122px (crossing middle line y=75 by 2px)
                            width: "74px",
                            height: "112px",
                            zIndex: 10,
                          }}
                          className="bg-neutral-950 border border-neutral-800 rounded-xl shadow-xl flex flex-col items-center pt-2 pb-0.5 select-none overflow-hidden"
                        >
                          {/* Centered Chord Name inside the box */}
                          <span className="text-xs font-black text-indigo-400 uppercase tracking-widest leading-none mb-0.5">
                            {chordSymbol}
                          </span>

                          {/* String Labels underneath, very little space before open string dots (negative margin) */}
                          <span className="text-[7.5px] font-bold text-neutral-500 uppercase tracking-[0.2em] leading-none -mb-1 z-20">
                            {getStringLabels()}
                          </span>

                          {/* Vexchords canvas placeholder - compressed to 64px width and 72px height */}
                          <div
                            className="chord-diagram-container inline-chordbox flex-1 flex items-center justify-center mt-1"
                            data-chord={chordSymbol}
                            style={{ width: "64px", height: "72px" }}
                          />
                        </div>
                      );
                    })}

                  </div>
                </div>
              </>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 select-none">
                <svg className="w-12 h-12 text-rose-500/50 mb-2 animate-bounce" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h4 className="font-bold text-neutral-300">Rendering Blocked</h4>
                <p className="text-xs text-neutral-500 max-w-sm mt-1">
                  Please check that both textareas contain valid, clean JSON files to initialize the visual vexchords compiler.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
