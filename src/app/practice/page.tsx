"use client";

import React, { Suspense, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
// @ts-expect-error vexchords is untyped
import { ChordBox } from "vexchords";
import { DEFAULT_SONG_JSON, DEFAULT_INSTRUMENT_JSON } from "../sandbox/defaultData";
import { EasyScoreDocument } from "../../types/easyScore";
import { PositionedSegment, positionSegments, tickToX, xToTick } from "../../utils/practiceTimeline";
import { selectPracticeRenderer } from "../../components/practice/practiceRenderers";
import {
  activeNoteIdsAtTick,
  beatsCrossed,
  buildNotationPlaybackModel,
  elapsedMsToTick,
  playbackPositionAtTick,
  tickToElapsedMs,
} from "../../components/practice/playbackModel";
import { resolvePlaybackSequence } from "../../components/practice/playbackResolver";
import { PianoNoteOutput } from "../../components/practice/pianoNoteOutput";
import { buildInlinePlaybackDocument } from "../../components/practice/inlinePlayback";
import {
  setRenderedNoteActive,
  type RenderedNoteRegistry,
} from "../../components/practice/notation/renderedNoteRegistry";

export interface Folder {
  id: number;
  user_id: number;
  folder_name: string;
  folder_parent: number | null;
}

export interface Score {
  id: number;
  user_id: number;
  folder_id: number | null;
  title: string;
  instrument?: string | null;
  author?: string | null;
  score_representation?: string | null;
}

export interface ChordInfo {
  id: string;
  beat: number;
  symbol: string;
  durationBeats: number;
}

export interface MeasureInfo {
  id: string;
  number: number;
  beats: number;
  chords?: ChordInfo[];
  lyrics?: { text: string }[];
  sectionId?: string;
  sectionLabel?: string | null;
  absoluteIndex?: number;
  showChordBox?: boolean;
}

export interface SectionInfo {
  id: string;
  label: string;
  measures: MeasureInfo[];
}

export interface SongRepresentation {
  schemaVersion: string;
  metadata: {
    title?: string;
    subtitle?: string;
    writers?: string[] | string;
    year?: number;
    source?: string;
    key?: string;
    capo?: number;
    tempo?: number | null;
    timeSignature?: [number, number];
    style?: string;
    notes?: string[];
    author?: string;
  };
  sections: SectionInfo[];
}

export interface InstrumentConfig {
  tuning: string[];
  chords: Record<string, (number | string)[]>;
}

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
const PRACTICE_REPEAT_MODE_STORAGE_KEY = "notestream_practice_repeat_mode";

type PracticeRepeatMode = "inline" | "scrollback";

export default function PracticePage() {
  return (
    <Suspense
      fallback={
        <div className="flex-1 flex flex-col items-center justify-center bg-neutral-950 text-neutral-400 min-h-[calc(100vh-64px)]">
          <svg className="animate-spin h-8 w-8 text-indigo-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <span className="text-sm font-bold tracking-widest uppercase animate-pulse">Initializing Practice Deck...</span>
        </div>
      }
    >
      <PracticePageContent />
    </Suspense>
  );
}

function PracticePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token } = useAuth();

  const scoreParam = searchParams.get("score");

  // Storage / Filespace States
  const [folders, setFolders] = useState<Folder[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);
  const [expandedFolderIds, setExpandedFolderIds] = useState<number[]>([]);

  // UI Open/Collapse States - initialized safely
  const [isTopPaneExpanded, setIsTopPaneExpanded] = useState<boolean>(!scoreParam);

  const [parsedInst, setParsedInst] = useState<InstrumentConfig | null>(null);

  // Horizontal Drag Scrolling offset
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; offset: number }>({ x: 0, offset: 0 });
  const viewportRef = useRef<HTMLDivElement>(null);

  // Auto-scroll / Metronome States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(100);
  const [volume, setVolume] = useState<number>(100);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState<boolean>(true);
  const [playbackMode, setPlaybackMode] = useState<"highlight" | "metronome" | "tonal">("metronome");
  const [isPracticeSettingsOpen, setIsPracticeSettingsOpen] = useState<boolean>(false);
  const [repeatMode, setRepeatMode] = useState<PracticeRepeatMode>(() => {
    if (typeof window === "undefined") return "scrollback";
    const savedRepeatMode = localStorage.getItem(PRACTICE_REPEAT_MODE_STORAGE_KEY);
    return savedRepeatMode === "inline" || savedRepeatMode === "scrollback"
      ? savedRepeatMode
      : "scrollback";
  });
  const [beatCount, setBeatCount] = useState<number>(0);
  const [beatMeasure, setBeatMeasure] = useState<number>(0);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [renderedNotes, setRenderedNotes] = useState<RenderedNoteRegistry>(new Map());

  const currentTickRef = useRef<number>(0);
  const displayXRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartElapsedRef = useRef<number>(0);
  const includeStartingBeatRef = useRef<boolean>(false);
  const renderedNotesRef = useRef<RenderedNoteRegistry>(new Map());
  const highlightedIdsRef = useRef<Set<string>>(new Set());
  const playbackHasStartedRef = useRef<boolean>(false);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef<number>(100);
  const pianoOutputRef = useRef<PianoNoteOutput | null>(null);
  const scheduledToneIdsRef = useRef<Set<string>>(new Set());

  // Load and Persist State for Storage Panel
  useEffect(() => {
    const savedFolderId = localStorage.getItem("notestream_practice_current_folder_id");
    const savedExpanded = localStorage.getItem("notestream_practice_expanded_folders");

    const init = () => {
      if (savedFolderId !== null) {
        try {
          setCurrentFolderId(JSON.parse(savedFolderId));
        } catch (e) {
          console.error("Failed to parse saved current folder id", e);
        }
      }
      if (savedExpanded !== null) {
        try {
          setExpandedFolderIds(JSON.parse(savedExpanded));
        } catch (e) {
          console.error("Failed to parse saved expanded folders list", e);
        }
      }
    };
    Promise.resolve().then(init);
  }, []);

  // Save changes to local storage when state changes
  useEffect(() => {
    localStorage.setItem("notestream_practice_current_folder_id", JSON.stringify(currentFolderId));
  }, [currentFolderId]);

  useEffect(() => {
    localStorage.setItem("notestream_practice_expanded_folders", JSON.stringify(expandedFolderIds));
  }, [expandedFolderIds]);

  useEffect(() => {
    localStorage.setItem(PRACTICE_REPEAT_MODE_STORAGE_KEY, repeatMode);
  }, [repeatMode]);

  useEffect(() => {
    if (!isPracticeSettingsOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPracticeSettingsOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPracticeSettingsOpen]);

  // Load Folder and Score Data (reusing logic from upload page)
  const fetchFoldersAndScores = useCallback(async () => {
    if (user && token) {
      try {
        const foldersRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/folders`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const scoresRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (foldersRes.ok && scoresRes.ok) {
          const foldersData = await foldersRes.json();
          const scoresData = await scoresRes.json();
          setFolders(foldersData.data || []);
          setScores(scoresData.data || []);
        }
      } catch (err) {
        console.error("Failed to fetch storage items:", err);
      }
    } else {
      // Guest local storage fallback
      const localFolders = localStorage.getItem("notestream_guest_folders");
      const localScores = localStorage.getItem("notestream_guest_scores");
      if (localFolders && localScores) {
        setFolders(JSON.parse(localFolders));
        setScores(JSON.parse(localScores));
      } else {
        // Defaults if guest storage is clean
        const defaultFolders: Folder[] = [
          { id: 101, user_id: 0, folder_name: "Chords & Tabs", folder_parent: null },
          { id: 102, user_id: 0, folder_name: "Beethoven Classics", folder_parent: null },
        ];
        const defaultScores: Score[] = [
          {
            id: 201,
            user_id: 0,
            folder_id: 101,
            title: "stand_by_me.ezs",
            score_representation: DEFAULT_SONG_JSON,
            instrument: "Ukulele",
            author: "Ben E. King",
          },
          {
            id: 202,
            user_id: 0,
            folder_id: 102,
            title: "fur_elise.ezs",
            score_representation: "{}",
            instrument: "Piano",
            author: "L. Beethoven",
          },
        ];
        setFolders(defaultFolders);
        setScores(defaultScores);
        localStorage.setItem("notestream_guest_folders", JSON.stringify(defaultFolders));
        localStorage.setItem("notestream_guest_scores", JSON.stringify(defaultScores));
      }
    }
  }, [user, token]);

  // Sync folders & scores on load/user-change
  useEffect(() => {
    Promise.resolve().then(fetchFoldersAndScores);
  }, [fetchFoldersAndScores]);

  // Read default instrument JSON on mount
  useEffect(() => {
    const init = () => {
      try {
        const inst = JSON.parse(DEFAULT_INSTRUMENT_JSON);
        setParsedInst(inst);
      } catch (e) {
        console.error("Error parsing default instrument configuration", e);
      }
    };
    Promise.resolve().then(init);
  }, []);

  // Compute active score dynamically from parameter to avoid set-state-in-effect and sync issues
  const activeScore = useMemo(() => {
    if (!scoreParam) return null;
    const scoreId = parseInt(scoreParam, 10);
    return scores.find((s) => s.id === scoreId) || null;
  }, [scoreParam, scores]);

  const [activeScoreData, setActiveScoreData] = useState<string | null>(null);

  // Fetch the full score representation from the backend if it's not fully loaded in the list
  useEffect(() => {
    if (!activeScore) {
      Promise.resolve().then(() => setActiveScoreData(null));
      return;
    }

    const safeStringify = (val: unknown) => typeof val === "string" ? val : JSON.stringify(val);
    const currentRepString = safeStringify(activeScore.score_representation);

    // Authenticated mode always fetches the detail endpoint so the practice page
    // cannot accidentally render a truncated/list-view score representation.
    // Guest mode can safely use its complete local representation directly.
    if (!user || !token) {
      Promise.resolve().then(() => setActiveScoreData(currentRepString));
      return;
    }

    // Clear old data while fetching the complete score.
    Promise.resolve().then(() => setActiveScoreData(null));

    if (user && token) {
      fetch(`${API_BASE_URL}/api/users/${user.id}/scores/${activeScore.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          const rep = data.data?.score_representation || data.data?.scoreRepresentation || data.score_representation || data.scoreRepresentation || "{}";
          setActiveScoreData(safeStringify(rep));
        })
        .catch(err => {
          console.error("Failed to fetch score data", err);
          setActiveScoreData(null);
        });
    }
  }, [activeScore, user, token]);

  // Compute parsedSong on the fly
  const parsedSong = useMemo<EasyScoreDocument | null>(() => {
    console.log("Recomputing parsedSong, activeScoreData exists:", !!activeScoreData);
    if (!activeScoreData) return null;
    try {
      let parsed = JSON.parse(activeScoreData);
      // Handle potential double-stringified JSON payload from backend
      if (typeof parsed === "string") {
        parsed = JSON.parse(parsed);
      }
      console.log("Successfully parsed JSON payload, keys:", Object.keys(parsed));
      return parsed;
    } catch (e) {
      console.error("Error parsing score representation:", e);
      return null;
    }
  }, [activeScoreData]);

  const resolvedPlaybackSequence = useMemo(
    () => parsedSong ? resolvePlaybackSequence(parsedSong) : undefined,
    [parsedSong]
  );

  const displaySong = useMemo(
    () => parsedSong && repeatMode === "inline" && resolvedPlaybackSequence
      ? buildInlinePlaybackDocument(parsedSong, resolvedPlaybackSequence)
      : parsedSong,
    [parsedSong, repeatMode, resolvedPlaybackSequence]
  );

  // Select renderer based on sheetType
  const renderer = useMemo(() => {
    if (!displaySong) return null;
    const resolved = selectPracticeRenderer(displaySong);
    console.log("Resolved renderer support. type:", displaySong.metadata?.sheetType, "Renderer instance assigned.");
    return resolved;
  }, [displaySong]);

  // Build timeline segments and position them
  const positionedSegments = useMemo<PositionedSegment[]>(() => {
    if (!displaySong || !renderer) {
       console.log("positionedSegments skipped. displaySong:", !!displaySong, "renderer:", !!renderer);
       return [];
    }
    const segments = renderer.buildTimeline(displaySong);
    console.log("Renderer built timeline, segments count:", segments.length);
    return positionSegments(segments, 0); // No gap between measure-sized segments to appear continuous
  }, [displaySong, renderer]);

  const playbackSequence = useMemo(
    () => repeatMode === "scrollback"
      ? resolvedPlaybackSequence
      : undefined,
    [repeatMode, resolvedPlaybackSequence]
  );

  const playbackModel = useMemo(
    () => displaySong
      ? buildNotationPlaybackModel(
          displaySong,
          repeatMode === "scrollback" ? playbackSequence : undefined
        )
      : { measures: [], notes: [], tones: [], beats: [], totalTicks: 0 },
    [displaySong, playbackSequence, repeatMode]
  );

  const playbackTickToPrintedX = useCallback((tick: number) => {
    const position = playbackPositionAtTick(playbackModel, tick);
    if (!position) return 0;
    const segment = positionedSegments[position.measure.sourceMeasureIndex];
    if (!segment) return 0;
    const progress = position.measure.durationTicks > 0
      ? position.offsetTicks / position.measure.durationTicks
      : 0;
    return segment.x + segment.width * progress;
  }, [playbackModel, positionedSegments]);

  const printedXToPlaybackTick = useCallback((x: number) => {
    const sourceIndex = positionedSegments.findIndex(segment =>
      x >= segment.x && x < segment.x + segment.width
    );
    const boundedSourceIndex = sourceIndex >= 0
      ? sourceIndex
      : x < (positionedSegments[0]?.x ?? 0)
        ? 0
        : Math.max(0, positionedSegments.length - 1);
    const segment = positionedSegments[boundedSourceIndex];
    if (!segment) return 0;
    const progress = Math.max(0, Math.min(1, (x - segment.x) / segment.width));
    const candidates = playbackModel.measures.filter(
      measure => measure.sourceMeasureIndex === boundedSourceIndex
    );
    const occurrence = candidates.reduce<(typeof candidates)[number] | undefined>(
      (closest, candidate) => {
        if (!closest) return candidate;
        return Math.abs(candidate.startTick - currentTickRef.current) <
          Math.abs(closest.startTick - currentTickRef.current)
          ? candidate
          : closest;
      },
      undefined
    );
    return occurrence
      ? occurrence.startTick + occurrence.durationTicks * progress
      : 0;
  }, [playbackModel.measures, positionedSegments]);

  const clearHighlights = useCallback(() => {
    highlightedIdsRef.current.forEach(id => {
      setRenderedNoteActive(renderedNotesRef.current, id, false);
    });
    highlightedIdsRef.current = new Set();
  }, []);

  const changeRepeatMode = useCallback((mode: PracticeRepeatMode) => {
    setIsPlaying(false);
    setIsFlashing(false);
    currentTickRef.current = 0;
    setCurrentTick(0);
    displayXRef.current = 0;
    setOffsetX(0);
    setBeatCount(0);
    setBeatMeasure(0);
    includeStartingBeatRef.current = false;
    playbackHasStartedRef.current = false;
    pianoOutputRef.current?.allNotesOff();
    scheduledToneIdsRef.current.clear();
    clearHighlights();
    void audioContextRef.current?.suspend();
    setRepeatMode(mode);
  }, [clearHighlights]);

  const applyHighlights = useCallback((tick: number) => {
    const nextIds = activeNoteIdsAtTick(playbackModel.notes, tick);
    highlightedIdsRef.current.forEach(id => {
      if (!nextIds.has(id)) {
        setRenderedNoteActive(renderedNotesRef.current, id, false);
      }
    });
    nextIds.forEach(id => {
      if (!highlightedIdsRef.current.has(id)) {
        setRenderedNoteActive(renderedNotesRef.current, id, true);
      }
    });
    highlightedIdsRef.current = nextIds;
  }, [playbackModel.notes]);

  const handleRenderedNotes = useCallback((notes: RenderedNoteRegistry) => {
    setRenderedNotes(notes);
  }, []);

  useEffect(() => {
    clearHighlights();
    renderedNotesRef.current = renderedNotes;
    if (playbackHasStartedRef.current) {
      applyHighlights(currentTickRef.current);
    }
  }, [applyHighlights, clearHighlights, renderedNotes]);

  // Compute uniqueChords and totalBeats on the fly
  const songData = useMemo(() => {
    if (!parsedSong) {
      return { uniqueChords: [], totalBeats: 0 };
    }
    const uniqueChordsSet = new Set<string>();
    let totalBeatsAcc = 0;

    const sections = parsedSong.chordLyrics ?? parsedSong.sections ?? [];
    sections.forEach((section) => {
      if (section.measures && section.measures.length > 0) {
        section.measures.forEach((measure) => {
          totalBeatsAcc += measure.beats || 4;

          if (measure.chords && measure.chords.length > 0) {
            measure.chords.forEach((c) => {
              if (c.symbol) {
                uniqueChordsSet.add(c.symbol);
              }
            });
          }
        });
      }
    });

    return {
      uniqueChords: Array.from(uniqueChordsSet),
      totalBeats: totalBeatsAcc,
    };
  }, [parsedSong]);

  const { uniqueChords } = songData;
  const flattenedMeasures = positionedSegments;

  // Sync state resets dynamically on activeScore change
  const prevActiveScoreIdRef = useRef<number | null>(null);
  useEffect(() => {
    const activeScoreId = activeScore?.id || null;
    if (activeScoreId !== prevActiveScoreIdRef.current) {
      prevActiveScoreIdRef.current = activeScoreId;
      Promise.resolve().then(() => {
        setOffsetX(0);
        setBeatCount(0);
        setBeatMeasure(0);
        setIsPlaying(false);
        setCurrentTick(0);
        currentTickRef.current = 0;
        displayXRef.current = 0;
        playbackHasStartedRef.current = false;
        pianoOutputRef.current?.allNotesOff();
        scheduledToneIdsRef.current.clear();
        clearHighlights();
      });
    }
  }, [activeScore, clearHighlights]);

  // Helper function to render vexchords inside all container placeholders
  const renderChordDiagrams = useCallback(() => {
    if (!parsedInst) return;

    const containers = document.querySelectorAll(".chord-diagram-container");
    containers.forEach((container: Element) => {
      container.innerHTML = "";

      const chordSymbol = container.getAttribute("data-chord");
      if (!chordSymbol) return;

      const frets = parsedInst.chords?.[chordSymbol];
      if (frets && Array.isArray(frets)) {
        const vexChord: [number, number | string][] = [];
        const len = frets.length;
        for (let i = 0; i < len; i++) {
          const fretVal = frets[i];
          const stringNum = len - i;
          if (fretVal === -1 || fretVal === "x") {
            vexChord.push([stringNum, "x"]);
          } else {
            vexChord.push([stringNum, fretVal]);
          }
        }

        try {
          const box = new ChordBox(container, {
            width: 64,
            height: 72,
            numStrings: frets.length || 4,
            numFrets: 5,
            showTuning: false,
            circleRadius: 3,
            defaultColor: "#d4d4d4",
            strokeColor: "#525252",
            textColor: "#f5f5f5",
          });

          box.draw({
            chord: vexChord,
          });
        } catch (err) {
          console.error("Vexchords render error for chord:", chordSymbol, err);
        }
      }
    });
  }, [parsedInst]);

  // Re-run Vexchords visualizer after rendering finishes
  useEffect(() => {
    const timer = setTimeout(() => {
      renderChordDiagrams();
    }, 100);
    return () => clearTimeout(timer);
  }, [flattenedMeasures, parsedInst, offsetX, uniqueChords, isTopPaneExpanded, renderChordDiagrams]);

  // Pointer drag events for middle pane songsheet stream
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

    const totalWidth = positionedSegments.length > 0
      ? positionedSegments[positionedSegments.length - 1].x + positionedSegments[positionedSegments.length - 1].width
      : 0;
    const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
    const playheadX = viewportWidth * 0.4;
    const visibleWidth = Math.max(0, viewportWidth - 150);

    const minOffset = Math.min(0, -(totalWidth - visibleWidth));

    if (newOffset > 0) newOffset = 0;
    if (newOffset < minOffset) newOffset = minOffset;

    setOffsetX(newOffset);

    // Sync tick and displayX with manual drag
    const scrollX = playheadX - newOffset;
    const draggedTick = playbackSequence
      ? printedXToPlaybackTick(scrollX)
      : xToTick(scrollX, positionedSegments);
    currentTickRef.current = draggedTick;
    setCurrentTick(draggedTick);
    displayXRef.current = scrollX;

    const draggedPosition = playbackPositionAtTick(playbackModel, draggedTick);
    if (draggedPosition) {
      setBeatMeasure(draggedPosition.measure.number);
      setBeatCount(
        Math.floor(draggedPosition.offsetTicks / draggedPosition.measure.beatTicks) + 1
      );
    }
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  // Sound generator for Metronome Click
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    }
    if (!masterGainRef.current) {
      const masterGain = audioContextRef.current.createGain();
      masterGain.gain.value = volumeRef.current / 100;
      masterGain.connect(audioContextRef.current.destination);
      masterGainRef.current = masterGain;
    }
    return audioContextRef.current;
  }, []);

  const playClick = useCallback((isFirstBeat: boolean) => {
    try {
      const ctx = getAudioContext();
      if (ctx.state === "suspended") {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(masterGainRef.current ?? ctx.destination);

      if (isFirstBeat) {
        osc.frequency.setValueAtTime(1000, ctx.currentTime);
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
      } else {
        osc.frequency.setValueAtTime(600, ctx.currentTime);
        gain.gain.setValueAtTime(0.15, ctx.currentTime);
      }

      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.08);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.1);
    } catch (e) {
      console.warn("AudioContext metronome click failed to play: ", e);
    }
  }, [getAudioContext]);

  const totalTicks = playbackModel.totalTicks;

  // Sync refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    if (isPlaying) {
      const now = performance.now();
      playbackStartTimeRef.current = now;
      playbackStartElapsedRef.current = tickToElapsedMs(
        playbackModel,
        currentTickRef.current,
        bpm
      );
      includeStartingBeatRef.current = true;
    }
  }, [isPlaying, bpm, playbackModel]);

  useEffect(() => {
    let animId: number;
    
    const loop = (time: number) => {
      if (!isPlayingRef.current) return;

      const currentT = currentTickRef.current;
      const nextT = elapsedMsToTick(
        playbackModel,
        playbackStartElapsedRef.current + time - playbackStartTimeRef.current,
        bpm
      );

      const crossedBeats = beatsCrossed(
        playbackModel,
        currentT,
        nextT,
        includeStartingBeatRef.current
      );
      const includeCurrentPosition = includeStartingBeatRef.current;
      includeStartingBeatRef.current = false;

      if (crossedBeats.length > 0) {
        if (playbackMode === "metronome") {
          setIsFlashing(true);
          setTimeout(() => setIsFlashing(false), 80);
          crossedBeats.forEach(beat => playClick(beat.accent));
        }
        const latestBeat = crossedBeats[crossedBeats.length - 1];
        setBeatMeasure(latestBeat.measure);
        setBeatCount(latestBeat.beat + 1);
      }

      if (playbackMode === "tonal") {
        const ctx = getAudioContext();
        if (!pianoOutputRef.current) {
          pianoOutputRef.current = new PianoNoteOutput(
            ctx,
            masterGainRef.current ?? ctx.destination
          );
        }
        playbackModel.tones.forEach(tone => {
          if (scheduledToneIdsRef.current.has(tone.id)) return;
          const toneEndTick = tone.startTick + tone.durationTicks;
          const startsInFrame =
            tone.startTick > currentT && tone.startTick <= nextT;
          const activeAtResume =
            includeCurrentPosition &&
            tone.startTick <= currentT &&
            currentT < toneEndTick;
          if (!startsInFrame && !activeAtResume) return;

          const audibleStartTick = Math.max(currentT, tone.startTick);
          const durationSeconds = Math.max(
            0.04,
            (tickToElapsedMs(playbackModel, toneEndTick, bpm) -
              tickToElapsedMs(playbackModel, audibleStartTick, bpm)) / 1000
          );
          pianoOutputRef.current?.playNote(
            tone.midiNote,
            ctx.currentTime,
            durationSeconds
          );
          scheduledToneIdsRef.current.add(tone.id);
        });
      }

      currentTickRef.current = nextT;
      applyHighlights(nextT);

      // LERP/Smooth the visual scroll offset
      const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
      const playheadX = viewportWidth * 0.4;
      
      const targetX = playbackSequence
        ? playbackTickToPrintedX(nextT)
        : tickToX(nextT, positionedSegments);
      const currentSourceIndex = playbackPositionAtTick(
        playbackModel,
        currentT
      )?.measure.sourceMeasureIndex;
      const nextSourceIndex = playbackPositionAtTick(
        playbackModel,
        nextT
      )?.measure.sourceMeasureIndex;
      const isTraversalJump =
        currentSourceIndex !== undefined &&
        nextSourceIndex !== undefined &&
        nextSourceIndex !== currentSourceIndex &&
        nextSourceIndex !== currentSourceIndex + 1;
      displayXRef.current = isTraversalJump
        ? targetX
        : displayXRef.current + (targetX - displayXRef.current) * 0.18;
      
      const computedOffset = playheadX - displayXRef.current;
      
      // Boundary clamp
      const totalSongWidth = positionedSegments.length > 0
        ? positionedSegments[positionedSegments.length - 1].x + positionedSegments[positionedSegments.length - 1].width
        : 0;
      const visibleWidth = Math.max(0, viewportWidth - 150);
      const minOffset = Math.min(0, -(totalSongWidth - visibleWidth));
      
      let adjusted = computedOffset;
      if (adjusted > 0) adjusted = 0;
      if (adjusted < minOffset) adjusted = minOffset;

      setOffsetX(adjusted);

      if (nextT >= totalTicks) {
        setIsPlaying(false);
        setIsFlashing(false);
        currentTickRef.current = 0;
        setCurrentTick(0);
        displayXRef.current = 0;
        setOffsetX(0);
        setBeatCount(0);
        setBeatMeasure(0);
        playbackHasStartedRef.current = false;
        pianoOutputRef.current?.allNotesOff();
        scheduledToneIdsRef.current.clear();
        clearHighlights();
        void audioContextRef.current?.suspend();
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    if (isPlaying) {
      animId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [applyHighlights, bpm, clearHighlights, getAudioContext, isPlaying, playbackMode, playbackModel, playbackSequence, playbackTickToPrintedX, playClick, positionedSegments, totalTicks]);

  // Sync visual offsets when song/tick changes while not playing or dragging
  useEffect(() => {
    if (!isPlaying && !isDragging) {
      const targetX = playbackSequence
        ? playbackTickToPrintedX(currentTick)
        : tickToX(currentTick, positionedSegments);
      displayXRef.current = targetX;
      
      const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
      const playheadX = viewportWidth * 0.4;
      const computedOffset = playheadX - targetX;

      const totalSongWidth = positionedSegments.length > 0
        ? positionedSegments[positionedSegments.length - 1].x + positionedSegments[positionedSegments.length - 1].width
        : 0;
      const visibleWidth = Math.max(0, viewportWidth - 150);
      const minOffset = Math.min(0, -(totalSongWidth - visibleWidth));
      
      let adjusted = computedOffset;
      if (adjusted > 0) adjusted = 0;
      if (adjusted < minOffset) adjusted = minOffset;

      setOffsetX(adjusted);
    }
  }, [currentTick, positionedSegments, isPlaying, isDragging, playbackSequence, playbackTickToPrintedX]);

  // Generate dynamic string label based on tuning configuration
  const getStringLabels = () => {
    if (parsedInst && parsedInst.tuning) {
      return parsedInst.tuning.map((t: string) => t.replace(/\d+/, "")).join(" ");
    }
    return "G C E A";
  };

  // Calculate Title & Author metadata to display in the header
  const getActiveScoreHeaderDetails = () => {
    if (!activeScore) return { title: "No Song Selected", subtitle: "" };

    let displayTitle = activeScore.title;
    let displaySubtitle = "";

    if (activeScoreData) {
      try {
        let parsed = JSON.parse(activeScoreData);
        if (typeof parsed === "string") {
          parsed = JSON.parse(parsed);
        }
        
        if (parsed.metadata) {
          if (parsed.metadata.title) {
            displayTitle = parsed.metadata.title;
          }
          if (parsed.metadata.writers && parsed.metadata.writers.length > 0) {
            displaySubtitle = Array.isArray(parsed.metadata.writers)
              ? parsed.metadata.writers.join(", ")
              : parsed.metadata.writers;
          } else if (parsed.metadata.author) {
            displaySubtitle = parsed.metadata.author;
          }
        }
      } catch {
        // Fallback to activeScore properties if error parsing
      }
    }

    if (!displaySubtitle && activeScore.author && activeScore.author !== "Unknown") {
      displaySubtitle = activeScore.author;
    }

    return { title: displayTitle, subtitle: displaySubtitle };
  };

  const { title: displayHeaderTitle, subtitle: displayHeaderSubtitle } = getActiveScoreHeaderDetails();

  // Active directory rendering items
  const currentFolders = folders.filter((f) => f.folder_parent === currentFolderId);
  const currentScores = scores.filter((s) => s.folder_id === currentFolderId);

  return (
    <main className="flex flex-col h-[calc(100vh-64px)] bg-neutral-950 overflow-hidden font-sans select-none text-neutral-200">
      
      {/* 1. TOP PANE: User Storage Selector & Header */}
      <div className="flex flex-col border-b border-neutral-800 bg-neutral-900 shrink-0 shadow-md">
        
        {/* Clickable Header Bar */}
        <div
          onClick={() => {
            if (activeScore) {
              setIsTopPaneExpanded((prev) => !prev);
            }
          }}
          className={`flex items-center justify-between px-6 py-4 cursor-pointer hover:bg-neutral-800/50 transition-colors select-none ${
            !activeScore ? "pointer-events-none" : ""
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Status indicator badge */}
            <div className={`w-2.5 h-2.5 rounded-full ${activeScore ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" : "bg-indigo-500 animate-pulse"}`} />
            
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                {!activeScore ? "Song selector" : "Practicing"}
              </span>
              <h2 className="text-sm sm:text-base font-extrabold text-neutral-100 truncate flex items-center gap-2">
                {displayHeaderTitle}
                {displayHeaderSubtitle && (
                  <span className="text-xs font-normal text-neutral-400">by {displayHeaderSubtitle}</span>
                )}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {activeScore && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setIsTopPaneExpanded(true);
                  router.push("/practice");
                }}
                className="px-2.5 py-1 text-[10px] bg-neutral-850 hover:bg-neutral-800 border border-neutral-750 hover:border-neutral-700 font-extrabold uppercase tracking-wider text-neutral-300 rounded transition-all active:scale-95 flex items-center gap-1.5"
                title="Deselect active score"
              >
                Close Song
              </button>
            )}
            
            {activeScore && (
              <button
                className="p-1 rounded-full text-neutral-400 hover:text-neutral-100 bg-neutral-850 border border-neutral-800 hover:border-neutral-700 transition-all"
                aria-label={isTopPaneExpanded ? "Collapse storage pane" : "Expand storage pane"}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-4 h-4 transform transition-transform duration-300 ${isTopPaneExpanded ? "rotate-180" : ""}`}
                >
                  <path fillRule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Expanded Storage Explorer Pane Body */}
        {isTopPaneExpanded && (
          <div className="border-t border-neutral-850 bg-neutral-950/40 px-6 py-4 flex flex-col md:flex-row gap-6 max-h-[220px] overflow-y-auto">
            {/* Left sidebar info or breadcrumbs */}
            <div className="md:w-1/4 flex flex-col justify-between shrink-0 gap-2">
              <div>
                <h3 className="text-xs font-bold tracking-wider text-neutral-400 uppercase">My Practice Library</h3>
                <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                  Select a chart from folders to load into the practice dashboard below.
                </p>
              </div>
              
              {/* Active directory path */}
              <div className="text-[10px] font-mono text-neutral-600 bg-neutral-950/50 border border-neutral-850 rounded p-1.5 truncate">
                Dir: {currentFolderId === null ? "Root/" : `${folders.find(f => f.id === currentFolderId)?.folder_name || "Folder"}/`}
              </div>
            </div>

            {/* Folder / Scores list layout */}
            <div className="flex-1 flex flex-col gap-2 min-w-0">
              <div className="flex items-center gap-2 flex-wrap pb-1.5 border-b border-neutral-850/60">
                {currentFolderId !== null && (
                  <button
                    onClick={() => {
                      const parentFolder = folders.find(f => f.id === currentFolderId);
                      setCurrentFolderId(parentFolder ? parentFolder.folder_parent : null);
                    }}
                    className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-neutral-850 hover:bg-neutral-800 border border-neutral-800 text-[10px] text-indigo-400 hover:text-indigo-300 font-extrabold uppercase tracking-wide transition-all select-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3 h-3 text-indigo-400">
                      <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17z" clipRule="evenodd" />
                    </svg>
                    Go Up (..)
                  </button>
                )}
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider font-semibold">Contents:</span>
              </div>

              {/* Dynamic grid for directories and files */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2 py-1 select-none">
                {currentFolders.length === 0 && currentScores.length === 0 && (
                  <div className="col-span-full py-4 text-center text-[11px] text-neutral-600 italic">
                    This directory is empty. Create or upload scores in the Upload deck.
                  </div>
                )}

                {/* Subdirectories list */}
                {currentFolders.map((folder) => (
                  <div
                    key={folder.id}
                    onClick={() => setCurrentFolderId(folder.id)}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-neutral-900 border border-neutral-850 hover:border-indigo-500/30 hover:bg-indigo-950/5 transition-all cursor-pointer text-xs font-semibold text-neutral-300 hover:text-neutral-200 select-none"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-amber-500 shrink-0">
                      <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836l-1.44-2.16A1.75 1.75 0 0 0 8.49 2H3.75z" />
                    </svg>
                    <span className="truncate">{folder.folder_name}</span>
                  </div>
                ))}

                {/* Scores list */}
                {currentScores.map((score) => {
                  const isThisActive = activeScore?.id === score.id;
                  return (
                    <div
                      key={score.id}
                      onClick={() => {
                        setIsTopPaneExpanded(false);
                        router.push(`/practice?score=${score.id}`);
                      }}
                      className={`flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg border cursor-pointer transition-all select-none ${
                        isThisActive
                          ? "border-emerald-500 bg-emerald-950/10 hover:bg-emerald-950/15"
                          : "border-neutral-850 bg-neutral-900/60 hover:border-emerald-500/25 hover:bg-emerald-950/5"
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4 text-emerald-400 shrink-0">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 0L22.5 9M19.5 6v12a3 3 0 11-6-0V9a3 3 0 016-0zm-12 12a3 3 0 11-6 0V6a3 3 0 016 0v12z" />
                        </svg>
                        <div className="flex flex-col min-w-0">
                          <span className={`text-xs font-bold truncate ${isThisActive ? "text-emerald-300" : "text-neutral-300"}`}>
                            {score.title}
                          </span>
                          {(score.instrument || score.author) && (
                            <span className="text-[9px] text-neutral-500 truncate mt-0.5 leading-none">
                              {score.instrument || "Ukulele"} • {score.author || "Unknown"}
                            </span>
                          )}
                        </div>
                      </div>
                      
                      {isThisActive && (
                        <span className="text-[9.5px] font-extrabold uppercase text-emerald-400 bg-emerald-950 px-1.5 py-0.5 rounded border border-emerald-500/20 shadow-sm shrink-0">
                          Active
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 2. MIDDLE PANE: Rendered Songsheet Stream (Draggable / Scrolling) */}
      <div className="flex-1 min-h-0 flex flex-col bg-neutral-950 relative border-b border-neutral-800">
        
        {/* Decorative Clef Background Grid Accent */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(99,102,241,0.02),rgba(255,255,255,0))]" />

        {/* Viewport Frame */}
        <div className="flex-1 flex items-center justify-center min-h-0 px-6">
          <div
            ref={viewportRef}
            className="w-full h-[85%] max-h-[360px] bg-neutral-950 border border-neutral-850 rounded-2xl relative flex overflow-hidden shadow-[inset_0_2px_15px_rgba(0,0,0,0.8)]"
          >
            {activeScore && flattenedMeasures.length > 0 ? (
              <>
                {renderer?.renderContinuous && displaySong ? (
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="flex-1 h-full select-none cursor-grab active:cursor-grabbing overflow-hidden relative z-10"
                  >
                    <div
                      style={{
                        transform: `translateX(${offsetX}px)`,
                        transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      className="h-full w-max shrink-0 relative"
                    >
                      {renderer.renderContinuous(displaySong, positionedSegments, {
                        isPlaying,
                        beatCount,
                        currentTick,
                        offsetX,
                        segments: positionedSegments,
                        parsedInst,
                        onRenderedNotes: handleRenderedNotes,
                      })}
                    </div>
                    {renderer.renderStationaryOverlay?.(displaySong, positionedSegments, {
                      isPlaying,
                      beatCount,
                      currentTick,
                      offsetX,
                      segments: positionedSegments,
                      parsedInst,
                      onRenderedNotes: handleRenderedNotes,
                    })}
                  </div>
                ) : (
                  <>
                    {/* Chord/lyrics renderers keep their static leading staff area. */}
                    <div className="w-[150px] h-full flex flex-col bg-neutral-950 border-r border-neutral-850 shrink-0 z-20 relative select-none shadow-[4px_0_12px_rgba(0,0,0,0.6)]">
                      <div className="h-[45px]" />
                      <svg className="w-full h-[135px]" viewBox="0 0 150 135" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <line x1="0" y1="45" x2="150" y2="45" stroke="#2a2a2a" strokeWidth="1" />
                        <line x1="0" y1="60" x2="150" y2="60" stroke="#2a2a2a" strokeWidth="1" />
                        <line x1="0" y1="75" x2="150" y2="75" stroke="#2a2a2a" strokeWidth="1" />
                        <line x1="0" y1="90" x2="150" y2="90" stroke="#2a2a2a" strokeWidth="1" />
                        <line x1="0" y1="105" x2="150" y2="105" stroke="#2a2a2a" strokeWidth="1" />
                      </svg>
                      <div className="h-[75px]" />
                    </div>

                    <div
                      onPointerDown={handlePointerDown}
                      onPointerMove={handlePointerMove}
                      onPointerUp={handlePointerUp}
                      onPointerCancel={handlePointerUp}
                      onPointerLeave={handlePointerUp}
                      className="flex-1 h-full select-none cursor-grab active:cursor-grabbing overflow-hidden relative z-10"
                    >
                      <div
                        style={{
                          transform: `translateX(${offsetX}px)`,
                          transition: isDragging ? "none" : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                        }}
                        className="flex flex-row h-full w-max shrink-0 relative"
                      >
                        {positionedSegments.map((segment) => {
                          if (!renderer) return null;
                          return renderer.renderSegment(segment, {
                            isPlaying,
                            beatCount,
                            currentTick,
                            offsetX,
                            segments: positionedSegments,
                            parsedInst,
                          });
                        })}
                      </div>
                    </div>
                  </>
                )}
              </>
            ) : (
              // Empty State Visual Placeholder when no score selected
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 select-none animate-fade-in relative z-10">
                <div className="w-16 h-16 bg-neutral-900 border border-neutral-850 rounded-full flex items-center justify-center text-indigo-400 mb-4 shadow-lg">
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8 animate-bounce">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v6m3-3H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                  </svg>
                </div>
                <h4 className="font-extrabold text-neutral-200 text-sm uppercase tracking-wider">Practice Deck Offline</h4>
                <p className="text-xs text-neutral-500 max-w-sm mt-1 mb-4 leading-relaxed">
                  Please open the library drawer above to pick a song and load the visual, interactive practice renderer.
                </p>
                <button
                  onClick={() => setIsTopPaneExpanded(true)}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-xs text-neutral-100 font-extrabold tracking-wider uppercase rounded-xl shadow-md shadow-indigo-600/10 transition-all active:scale-95"
                >
                  Browse Practice Library
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 3. BOTTOM PANE: Practice Dashboard & Unique Chord Dictionary */}
      <div className="h-[200px] border-t border-neutral-800 bg-neutral-900/80 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row gap-6 shrink-0 shadow-[0_-4px_15px_rgba(0,0,0,0.5)] z-20">
        
        {/* Practice Playback Control Console */}
        <div className="md:w-1/3 flex flex-col justify-between shrink-0 gap-2 border-r border-neutral-850 md:pr-6">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
              Practice controls
            </span>

            <div className="flex items-center gap-2">
              {/* Metronome Beat Flash Indicator */}
              {isPlaying && (
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full ${isFlashing ? "bg-indigo-500 scale-125 shadow-[0_0_12px_rgba(99,102,241,0.8)]" : "bg-neutral-800"} transition-all duration-75`} />
                  <span className="text-[9.5px] font-mono font-extrabold text-neutral-500">
                    {beatMeasure}:{beatCount}
                  </span>
                </div>
              )}
              <button
                type="button"
                onClick={() => setIsPracticeSettingsOpen(true)}
                className="rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Open practice settings"
                title="Practice settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.592c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.245c.275.476.17 1.079-.252 1.43l-1.003.827c-.293.241-.438.613-.43.992a6.759 6.759 0 010 .255c-.008.378.137.75.43.992l1.003.827c.424.35.527.954.252 1.43l-1.296 2.245a1.125 1.125 0 01-1.37.49l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.592c-.55 0-1.02-.397-1.11-.94l-.213-1.281c-.063-.374-.313-.686-.645-.87a6.52 6.52 0 01-.22-.127c-.324-.196-.72-.257-1.075-.124l-1.217.456a1.125 1.125 0 01-1.37-.49l-1.296-2.245a1.125 1.125 0 01.252-1.43l1.003-.827c.293-.242.438-.614.43-.992a6.822 6.822 0 010-.255c.008-.379-.137-.75-.43-.992l-1.003-.827a1.125 1.125 0 01-.252-1.43l1.296-2.245a1.125 1.125 0 011.37-.49l1.217.456c.355.133.75.072 1.076-.124.072-.044.146-.086.22-.128.331-.183.581-.495.644-.869l.213-1.281z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 rounded-lg bg-neutral-950/70 p-1 border border-neutral-800">
            {([
              ["highlight", "Highlight"],
              ["metronome", "Metronome"],
              ["tonal", "Tonal"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  pianoOutputRef.current?.allNotesOff();
                  scheduledToneIdsRef.current.clear();
                  setIsFlashing(false);
                  setPlaybackMode(mode);
                  if (isPlaying && mode !== "highlight") {
                    const ctx = getAudioContext();
                    void ctx.resume();
                  }
                  if (isPlaying) {
                    includeStartingBeatRef.current = true;
                  }
                }}
                disabled={totalTicks === 0}
                className={`rounded-md px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-40 ${
                  playbackMode === mode
                    ? "bg-indigo-600 text-white"
                    : "text-neutral-500 hover:bg-neutral-800 hover:text-neutral-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Controls Button Row */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (totalTicks > 0) {
                  const nextPlaying = !isPlaying;
                  if (nextPlaying) {
                    playbackHasStartedRef.current = true;
                    scheduledToneIdsRef.current.clear();
                    if (playbackMode !== "highlight") {
                      const ctx = getAudioContext();
                      void ctx.resume();
                    }
                  }
                  setIsPlaying(nextPlaying);
                  if (!nextPlaying) {
                    setIsFlashing(false);
                    setCurrentTick(currentTickRef.current);
                    pianoOutputRef.current?.allNotesOff();
                    scheduledToneIdsRef.current.clear();
                    void audioContextRef.current?.suspend();
                  }
                }
              }}
              disabled={totalTicks === 0}
              className={`flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all active:scale-95 flex items-center justify-center gap-2 shadow-md ${
                isPlaying
                  ? "bg-rose-600 hover:bg-rose-500 text-neutral-100 shadow-rose-600/10 border border-rose-500/20"
                  : "bg-indigo-600 hover:bg-indigo-500 disabled:bg-neutral-800 text-neutral-100 disabled:text-neutral-600 shadow-indigo-600/10 border border-indigo-500/20 disabled:border-transparent"
              }`}
            >
              {isPlaying ? (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h12.5a.75.75 0 010 1.5H3.75A.75.75 0 013 10z" clipRule="evenodd" />
                  </svg>
                  Pause Score
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                    <path fillRule="evenodd" d="M2 10a8 8 0 1116 0 8 8 0 01-16 0zm6.39-2.908a.75.75 0 01.766.027l3.5 2.25a.75.75 0 010 1.262l-3.5 2.25A.75.75 0 018 12.25v-4.5a.75.75 0 01.39-.658z" clipRule="evenodd" />
                  </svg>
                  Play Score
                </>
              )}
            </button>

            <button
              onClick={() => {
                setOffsetX(0);
                setBeatCount(0);
                setBeatMeasure(0);
                setIsPlaying(false);
                setIsFlashing(false);
                currentTickRef.current = 0;
                setCurrentTick(0);
                displayXRef.current = 0;
                includeStartingBeatRef.current = false;
                playbackHasStartedRef.current = false;
                pianoOutputRef.current?.allNotesOff();
                scheduledToneIdsRef.current.clear();
                clearHighlights();
                void audioContextRef.current?.suspend();
              }}
              disabled={totalTicks === 0}
              className="p-3 bg-neutral-800 hover:bg-neutral-750 disabled:bg-neutral-850 text-neutral-300 disabled:text-neutral-700 rounded-xl border border-neutral-750 disabled:border-transparent transition-all active:scale-95"
              title="Reset Practice playback playhead to start"
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>

          {/* Tempo and Volume Sliders */}
          <div className="grid grid-cols-2 gap-4 pb-1">
            <label className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400">
                <span>Tempo:</span>
                <span className="font-mono text-xs font-black text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/10">
                  {bpm} BPM
                </span>
              </div>
              <input
                type="range"
                min="50"
                max="200"
                value={bpm}
                disabled={flattenedMeasures.length === 0}
                onChange={(e) => {
                  pianoOutputRef.current?.allNotesOff();
                  scheduledToneIdsRef.current.clear();
                  includeStartingBeatRef.current = isPlaying;
                  setBpm(parseInt(e.target.value, 10));
                }}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </label>

            <label className="flex flex-col gap-1.5 min-w-0">
              <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-400">
                <span>Volume:</span>
                <span className="font-mono text-xs font-black text-indigo-400 bg-indigo-950/40 px-2 py-0.5 rounded border border-indigo-500/10">
                  {volume}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                disabled={flattenedMeasures.length === 0}
                aria-label="Playback volume"
                onChange={(e) => {
                  const nextVolume = parseInt(e.target.value, 10);
                  volumeRef.current = nextVolume;
                  setVolume(nextVolume);
                  const masterGain = masterGainRef.current;
                  if (masterGain) {
                    masterGain.gain.setTargetAtTime(
                      nextVolume / 100,
                      masterGain.context.currentTime,
                      0.01
                    );
                  }
                }}
                className="w-full h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-indigo-500 focus:outline-none disabled:opacity-50"
              />
            </label>
          </div>
        </div>

        {/* Practice Feedback Mock-up */}
        <div className={`relative flex-1 min-w-0 min-h-0 ${
          uniqueChords.length > 0 ? "border-r border-neutral-850 md:pr-6" : ""
        }`}>
          <button
            type="button"
            onClick={() => setIsFeedbackVisible(visible => !visible)}
            aria-label={isFeedbackVisible ? "Hide practice feedback" : "Show practice feedback"}
            aria-pressed={!isFeedbackVisible}
            title={isFeedbackVisible ? "Hide practice feedback" : "Show practice feedback"}
            className="absolute right-6 top-0 z-10 rounded-md p-1 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-indigo-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            {isFeedbackVisible ? (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.451 10.451 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
              </svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </button>

          <div className={`flex h-full flex-col transition-opacity duration-200 ${
            isFeedbackVisible ? "opacity-100" : "pointer-events-none opacity-0"
          }`} aria-hidden={!isFeedbackVisible}>
            <div className="flex items-center justify-between mb-2 pr-7">
              <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                Practice feedback
              </span>
              <span className="text-[8px] uppercase font-bold tracking-wider text-neutral-600">
                Preview
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                ["Tonality", "92%"],
                ["Timing precision", "88%"],
                ["Accuracy", "90%"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="min-w-0 rounded-lg border border-neutral-800 bg-neutral-950/50 px-2 py-1.5"
                >
                  <div className="truncate text-[8px] font-bold uppercase tracking-wide text-neutral-500">
                    {label}
                  </div>
                  <div className="font-mono text-sm font-black text-indigo-400">
                    {value}
                  </div>
                </div>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-neutral-800 bg-neutral-950/30 px-2 py-1.5">
              <div className="mb-1 text-[8px] font-bold uppercase tracking-widest text-neutral-600">
                Recommendations
              </div>
              <ul className="space-y-1.5">
                <li className="rounded-md bg-neutral-900/80 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-300">
                  Repeat the ascending passage in measures 9–10 at a lower tempo, increasing it as accuracy develops.
                </li>
                <li className="rounded-md bg-neutral-900/80 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-300">
                  Practice moving from C♯ minor to G major and back until the transition feels even.
                </li>
                <li className="rounded-md bg-neutral-900/80 px-2 py-1.5 text-[10px] leading-relaxed text-neutral-300">
                  Isolate the off-beat entrances in measures 13–14 and practice them with the metronome.
                </li>
              </ul>
            </div>
          </div>
        </div>

        {uniqueChords.length > 0 && (
          /* Dynamic Vexchords Chords Reference Dictionary Pane */
          <div className="flex-1 flex flex-col min-w-0">
            <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400 mb-2 block">
              Chord dictionary ({uniqueChords.length} unique chords)
            </span>

            <div className="flex-1 bg-neutral-950/30 border border-neutral-850/60 rounded-xl px-4 py-2 flex items-center overflow-x-auto min-w-0 select-none">
              <div className="flex items-center gap-4 py-1">
                {uniqueChords.map((chord) => (
                  <div
                    key={`dict-chord-${chord}`}
                    className="flex flex-col items-center shrink-0 w-[74px] h-[102px] bg-neutral-950 border border-neutral-850 hover:border-indigo-500/30 rounded-xl transition-all select-none pt-1"
                  >
                    <span className="text-[10px] font-black text-neutral-300 uppercase leading-none tracking-wider mb-0.5">
                      {chord}
                    </span>
                    <span className="text-[6.5px] font-extrabold text-neutral-600 uppercase tracking-widest leading-none mb-0.5">
                      {getStringLabels()}
                    </span>
                    <div
                      className="chord-diagram-container inline-chordbox flex-1 flex items-center justify-center"
                      data-chord={chord}
                      style={{ width: "64px", height: "72px" }}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {isPracticeSettingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsPracticeSettingsOpen(false);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="practice-settings-title"
            className="w-full max-w-md rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl shadow-black/60"
          >
            <div className="mb-5 flex items-start justify-between gap-4">
              <div>
                <h2 id="practice-settings-title" className="text-sm font-black uppercase tracking-wider text-neutral-100">
                  Practice settings
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-neutral-500">
                  Choose how practice playback presents repeated passages.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsPracticeSettingsOpen(false)}
                className="rounded-lg p-1.5 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                aria-label="Close practice settings"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="h-4 w-4" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <fieldset>
              <legend className="mb-2 text-[10px] font-bold uppercase tracking-widest text-indigo-400">
                Repeat presentation
              </legend>
              <div className="grid gap-2">
                {([
                  ["inline", "Inline Repeat", "Show repeated passages and each applicable ending in playback order; repeat signs appear ghosted."],
                  ["scrollback", "Scrollback Repeat", "Keep the printed layout and full-strength repeat signs, then quickly return to the repeat start."],
                ] as const).map(([value, label, description]) => (
                  <label
                    key={value}
                    className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition-colors ${
                      repeatMode === value
                        ? "border-indigo-500/70 bg-indigo-950/35"
                        : "border-neutral-800 bg-neutral-950/40 hover:border-neutral-700"
                    }`}
                  >
                    <input
                      type="radio"
                      name="practice-repeat-mode"
                      value={value}
                      checked={repeatMode === value}
                      onChange={() => changeRepeatMode(value)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-500"
                    />
                    <span>
                      <span className="block text-xs font-extrabold text-neutral-200">{label}</span>
                      <span className="mt-1 block text-[11px] leading-relaxed text-neutral-500">{description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>

            <p className="mt-4 rounded-lg border border-indigo-500/15 bg-indigo-950/20 px-3 py-2 text-[10px] leading-relaxed text-indigo-200/65">
              Both modes follow the same resolved repeat sequence; only their presentation differs.
            </p>
          </section>
        </div>
      )}

    </main>
  );
}
