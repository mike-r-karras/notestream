"use client";

import React, { Suspense, useEffect, useState, useRef, useMemo, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../context/AuthContext";
// @ts-expect-error vexchords is untyped
import { ChordBox } from "vexchords";
import { DEFAULT_SONG_JSON } from "../sandbox/defaultData";
import { EasyScoreDocument, InstrumentConfig } from "../../types/easyScore";
import { PositionedSegment, positionSegments, tickToX, xToTick } from "../../utils/practiceTimeline";
import {
  chordLyricsPracticeRenderer,
  notationPracticeRenderer,
  selectPracticeRenderer,
} from "../../components/practice/practiceRenderers";
import {
  activeNoteIdsAtTick,
  beatsCrossed,
  buildNotationPlaybackModel,
  elapsedMsToTick,
  playbackTonesForStaffs,
  playbackPositionAtTick,
  tickToElapsedMs,
} from "../../components/practice/playbackModel";
import { resolvePlaybackSequence } from "../../components/practice/playbackResolver";
import { PianoNoteOutput } from "../../components/practice/pianoNoteOutput";
import {
  PracticeAudioDetector,
  type PracticeAudioDebugSnapshot,
} from "../../components/practice/audio/practiceAudioDetector";
import { buildExpectedNoteEvents } from "../../components/practice/detection/scoreExpectedEvents";
import {
  mergePerformanceResults,
  scorePracticePerformance,
} from "../../components/practice/detection/practicePerformanceScorer";
import type { PracticeDetectionResult } from "../../components/practice/detection/practiceDetectionTypes";
import { buildInlinePlaybackDocument } from "../../components/practice/inlinePlayback";
import {
  setRenderedNoteActive,
  setRenderedNoteFeedback,
  type RenderedNoteRegistry,
} from "../../components/practice/notation/renderedNoteRegistry";
import { getNotationMeasures } from "../../components/practice/notation/timeline";
import { getStaffNumbers } from "../../components/practice/notation/scoreModel";
import {
  toggleHiddenHand,
  type PianoHand,
} from "../../components/practice/handVisibility";
import { NOTATION_LAYOUT } from "../../components/practice/notation/layout";
import { getInstrumentConfig } from "../../config/instruments/registry";
import { buildChordLyricsPlaybackModel } from "../../components/practice/chordLyricsPlayback";
import { playbackScrollDistance } from "../../components/practice/scrollSynchronizer";
import {
  buildMetronomeSchedule,
  metronomeBeatsInWindow,
} from "../../components/practice/metronomeSchedule";
import {
  chordFeedbackByBeat,
  musicalFeedbackMessage,
  notationFeedbackByEvent,
} from "../../components/practice/detection/feedbackPresentation";
import {
  expectedEventAtOrAfter,
  guidedResultIsAccepted,
  nextExpectedEvent,
} from "../../components/practice/detection/guidedPractice";
import { notationRenderWindow } from "../../components/practice/notation/virtualization";
import {
  parseSongPracticeSettings,
  songPracticeSettingsKey,
  type SongPracticeSettings,
} from "../../components/practice/practiceSettings";

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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
const SYNTH_MIC_WARNING_STORAGE_KEY = "notestream_hide_synth_mic_warning";
const MUSICAL_FEEDBACK_HOLD_MS = 1800;
const METRONOME_LOOKAHEAD_MS = 200;
const METRONOME_SCHEDULER_INTERVAL_MS = 25;
const METRONOME_LATE_GRACE_MS = 30;
const METRONOME_MINIMUM_LEAD_SECONDS = 0.005;

type PracticeRepeatMode = "inline" | "scrollback";

function midiLabel(midi: number): string {
  const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  return `${names[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
}

function HandSilhouette({ hand }: { hand: PianoHand }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      className="h-5 w-5"
      aria-hidden="true"
      style={hand === "right" ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M6.5 20.2c-1.1-1.5-1.7-3.2-1.7-5.1V9.8c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v3.1h.6V5.7c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v6.6h.6V3.8c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v8.5h.6V5.1c0-.7.5-1.2 1.2-1.2s1.2.5 1.2 1.2v7.8l1.3-1.6c.5-.6 1.4-.7 2-.2.6.5.7 1.4.2 2l-2.6 3.5c-.5.7-.8 1.5-.9 2.4l-.1 2.4H7.4l-.9-1.2Z" />
    </svg>
  );
}

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

  // Horizontal Drag Scrolling offset
  const [offsetX, setOffsetX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; offset: number }>({ x: 0, offset: 0 });
  const preserveOffsetAfterDragRef = useRef(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);

  // Auto-scroll / Metronome States
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [bpm, setBpm] = useState<number>(100);
  const [volume, setVolume] = useState<number>(100);
  const [isFeedbackVisible, setIsFeedbackVisible] = useState<boolean>(true);
  const [showMeasureNumbers, setShowMeasureNumbers] = useState<boolean>(false);
  const [playbackMode, setPlaybackMode] = useState<"highlight" | "metronome" | "tonal" | "follow">("metronome");
  const [isPracticeSettingsOpen, setIsPracticeSettingsOpen] = useState<boolean>(false);
  const [expandedChord, setExpandedChord] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [isSavingTitle, setIsSavingTitle] = useState(false);
  const [titleSaveError, setTitleSaveError] = useState<string | null>(null);
  const [isSynthMicWarningOpen, setIsSynthMicWarningOpen] = useState(false);
  const [dontShowSynthMicWarningAgain, setDontShowSynthMicWarningAgain] = useState(false);
  const [repeatMode, setRepeatMode] = useState<PracticeRepeatMode>("scrollback");
  const [beatCount, setBeatCount] = useState<number>(0);
  const [beatMeasure, setBeatMeasure] = useState<number>(0);
  const [isFlashing, setIsFlashing] = useState<boolean>(false);
  const [currentTick, setCurrentTick] = useState<number>(0);
  const [renderedNotes, setRenderedNotes] = useState<RenderedNoteRegistry>(new Map());
  const [isDetectionEnabled, setIsDetectionEnabled] = useState(false);
  const [detectionError, setDetectionError] = useState<string | null>(null);
  const [performanceResults, setPerformanceResults] = useState<Map<string, PracticeDetectionResult>>(new Map());
  const [visibleFeedbackResults, setVisibleFeedbackResults] = useState<Map<string, PracticeDetectionResult>>(new Map());
  const [handVisibility, setHandVisibility] = useState<{
    scoreId: number | null;
    hiddenHand: PianoHand | null;
  }>({ scoreId: null, hiddenHand: null });

  const currentTickRef = useRef<number>(0);
  const displayXRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const playbackModeRef = useRef(playbackMode);
  const guidedEventIdRef = useRef<string | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartElapsedRef = useRef<number>(0);
  const includeStartingBeatRef = useRef<boolean>(false);
  const renderedNotesRef = useRef<RenderedNoteRegistry>(new Map());
  const highlightedIdsRef = useRef<Set<string>>(new Set());
  const feedbackIdsRef = useRef<Set<string>>(new Set());
  const playbackHasStartedRef = useRef<boolean>(false);
  const settingsScoreKeyRef = useRef<string | null>(null);
  const restoringSettingsSnapshotRef = useRef<string | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef<number>(100);
  const pianoOutputRef = useRef<PianoNoteOutput | null>(null);
  const scheduledToneIdsRef = useRef<Set<string>>(new Set());
  const scheduledMetronomeOscillatorsRef = useRef<Set<OscillatorNode>>(new Set());
  const audioDetectorRef = useRef<PracticeAudioDetector | null>(null);
  const feedbackExpiryTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

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
    if (!isPracticeSettingsOpen && !isSynthMicWarningOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsPracticeSettingsOpen(false);
      if (event.key === "Escape") setIsSynthMicWarningOpen(false);
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [isPracticeSettingsOpen, isSynthMicWarningOpen]);

  const showSynthMicWarning = useCallback(() => {
    if (localStorage.getItem(SYNTH_MIC_WARNING_STORAGE_KEY) === "true") return;
    setDontShowSynthMicWarningAgain(false);
    setIsSynthMicWarningOpen(true);
  }, []);

  const dismissSynthMicWarning = useCallback(() => {
    if (dontShowSynthMicWarningAgain) {
      localStorage.setItem(SYNTH_MIC_WARNING_STORAGE_KEY, "true");
    }
    setIsSynthMicWarningOpen(false);
    setDontShowSynthMicWarningAgain(false);
  }, [dontShowSynthMicWarningAgain]);

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

  // Compute active score dynamically from parameter to avoid set-state-in-effect and sync issues
  const activeScore = useMemo(() => {
    if (!scoreParam) return null;
    const scoreId = parseInt(scoreParam, 10);
    return scores.find((s) => s.id === scoreId) || null;
  }, [scoreParam, scores]);

  useEffect(() => {
    if (!activeScore) {
      settingsScoreKeyRef.current = null;
      restoringSettingsSnapshotRef.current = null;
      return;
    }

    const storageKey = songPracticeSettingsKey(activeScore.id, activeScore.user_id);
    const settings = parseSongPracticeSettings(localStorage.getItem(storageKey));
    settingsScoreKeyRef.current = storageKey;
    restoringSettingsSnapshotRef.current = JSON.stringify(settings);

    volumeRef.current = settings.volume;
    playbackModeRef.current = settings.playbackMode;
    Promise.resolve().then(() => {
      setBpm(settings.bpm);
      setVolume(settings.volume);
      setPlaybackMode(settings.playbackMode);
      setRepeatMode(settings.repeatMode);
      setIsFeedbackVisible(settings.isFeedbackVisible);
      setShowMeasureNumbers(settings.showMeasureNumbers);
      setHandVisibility({ scoreId: activeScore.id, hiddenHand: settings.hiddenHand });
    });

    const masterGain = masterGainRef.current;
    if (masterGain) {
      masterGain.gain.setTargetAtTime(
        settings.volume / 100,
        masterGain.context.currentTime,
        0.01
      );
    }
  }, [activeScore]);

  useEffect(() => {
    if (!activeScore) return;
    const storageKey = songPracticeSettingsKey(activeScore.id, activeScore.user_id);
    if (settingsScoreKeyRef.current !== storageKey) return;

    const settings: SongPracticeSettings = {
      bpm,
      volume,
      playbackMode,
      repeatMode,
      isFeedbackVisible,
      showMeasureNumbers,
      hiddenHand: handVisibility.scoreId === activeScore.id
        ? handVisibility.hiddenHand
        : null,
    };
    const serialized = JSON.stringify(settings);
    if (restoringSettingsSnapshotRef.current !== null) {
      if (serialized === restoringSettingsSnapshotRef.current) {
        restoringSettingsSnapshotRef.current = null;
      }
      return;
    }
    localStorage.setItem(storageKey, serialized);
  }, [
    activeScore,
    bpm,
    handVisibility,
    isFeedbackVisible,
    playbackMode,
    repeatMode,
    showMeasureNumbers,
    volume,
  ]);

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

  const parsedInst = useMemo<InstrumentConfig | null>(
    () => getInstrumentConfig(
      parsedSong?.metadata.instrument,
      activeScore?.instrument
    ),
    [activeScore?.instrument, parsedSong?.metadata.instrument]
  );

  const canEditActiveScoreTitle = !!(
    user && token && activeScore && activeScore.user_id === user.id
  );

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

  const notationStaffNumbers = useMemo(
    () => displaySong
      ? getStaffNumbers(getNotationMeasures(displaySong))
      : [1],
    [displaySong]
  );
  const notationStaffCount = notationStaffNumbers.length;

  const showsPianoHandControls = !!renderer?.renderContinuous && notationStaffCount === 2;
  const hiddenHand = handVisibility.scoreId === (activeScore?.id ?? null)
    ? handVisibility.hiddenHand
    : null;

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

  const segmentedRenderWindow = useMemo(
    () => notationRenderWindow(positionedSegments, offsetX, viewportWidth),
    [offsetX, positionedSegments, viewportWidth]
  );

  const playbackSequence = useMemo(
    () => repeatMode === "scrollback"
      ? resolvedPlaybackSequence
      : undefined,
    [repeatMode, resolvedPlaybackSequence]
  );

  const playbackModel = useMemo(
    () => displaySong
      ? renderer === chordLyricsPracticeRenderer
        ? buildChordLyricsPlaybackModel(displaySong, parsedInst)
        : buildNotationPlaybackModel(
          displaySong,
          repeatMode === "scrollback" ? playbackSequence : undefined
        )
      : { measures: [], notes: [], tones: [], beats: [], totalTicks: 0 },
    [displaySong, parsedInst, playbackSequence, renderer, repeatMode]
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
    guidedEventIdRef.current = null;
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
    const viewport = viewportRef.current;
    if (!viewport) return;

    const updateViewportWidth = () => {
      setViewportWidth(viewport.getBoundingClientRect().width);
    };
    updateViewportWidth();

    const observer = new ResizeObserver(updateViewportWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
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
        setIsEditingTitle(false);
        setEditedTitle("");
        setTitleSaveError(null);
        setOffsetX(0);
        setBeatCount(0);
        setBeatMeasure(0);
        setIsPlaying(false);
        setCurrentTick(0);
        currentTickRef.current = 0;
        displayXRef.current = 0;
        playbackHasStartedRef.current = false;
        guidedEventIdRef.current = null;
        pianoOutputRef.current?.allNotesOff();
        scheduledToneIdsRef.current.clear();
        setPerformanceResults(new Map());
        setVisibleFeedbackResults(new Map());
        feedbackExpiryTimersRef.current.forEach(timer => clearTimeout(timer));
        feedbackExpiryTimersRef.current.clear();
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
      const isExpanded = container.getAttribute("data-expanded") === "true";

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
            width: isExpanded ? 220 : 64,
            height: isExpanded ? 250 : 72,
            numStrings: frets.length || 4,
            numFrets: 5,
            showTuning: false,
            circleRadius: isExpanded ? 8 : 3,
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
  }, [parsedInst]);

  // Re-run Vexchords visualizer after rendering finishes
  useEffect(() => {
    const timer = setTimeout(() => {
      renderChordDiagrams();
    }, 100);
    return () => clearTimeout(timer);
  }, [
    expandedChord,
    flattenedMeasures,
    parsedInst,
    uniqueChords,
    isTopPaneExpanded,
    renderChordDiagrams,
    segmentedRenderWindow.startIndex,
    segmentedRenderWindow.endIndex,
  ]);

  useEffect(() => {
    if (!expandedChord) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpandedChord(null);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [expandedChord]);

  // Pointer drag events for middle pane songsheet stream
  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      offset: offsetX,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
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
    preserveOffsetAfterDragRef.current = true;
    setIsDragging(false);
    const target = e.currentTarget as HTMLElement;
    if (target.hasPointerCapture(e.pointerId)) {
      target.releasePointerCapture(e.pointerId);
    }
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

  const scheduleClick = useCallback((isFirstBeat: boolean, when: number) => {
    try {
      const ctx = getAudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = Math.max(ctx.currentTime, when);

      osc.connect(gain);
      gain.connect(masterGainRef.current ?? ctx.destination);

      if (isFirstBeat) {
        osc.frequency.setValueAtTime(1000, startTime);
        gain.gain.setValueAtTime(0.3, startTime);
      } else {
        osc.frequency.setValueAtTime(600, startTime);
        gain.gain.setValueAtTime(0.15, startTime);
      }

      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.08);
      scheduledMetronomeOscillatorsRef.current.add(osc);
      osc.addEventListener('ended', () => {
        scheduledMetronomeOscillatorsRef.current.delete(osc);
        osc.disconnect();
        gain.disconnect();
      }, { once: true });
      osc.start(startTime);
      osc.stop(startTime + 0.1);
    } catch (e) {
      console.warn("AudioContext metronome click failed to play: ", e);
    }
  }, [getAudioContext]);

  const cancelScheduledClicks = useCallback(() => {
    scheduledMetronomeOscillatorsRef.current.forEach(oscillator => {
      try {
        oscillator.stop();
      } catch {
        // An oscillator that has already ended needs no further cleanup.
      }
    });
    scheduledMetronomeOscillatorsRef.current.clear();
  }, []);

  const totalTicks = playbackModel.totalTicks;
  const metronomeSchedule = useMemo(
    () => buildMetronomeSchedule(playbackModel, bpm),
    [bpm, playbackModel]
  );
  const visibleDetectionStaffs = useMemo(
    () => hiddenHand === null
      ? notationStaffNumbers
      : notationStaffNumbers.filter((_, index) =>
          index !== (hiddenHand === "right" ? 0 : 1)
        ),
    [hiddenHand, notationStaffNumbers]
  );
  const expectedDetectionEvents = useMemo(
    () => buildExpectedNoteEvents(playbackModel, bpm, visibleDetectionStaffs),
    [playbackModel, bpm, visibleDetectionStaffs]
  );
  const visiblePlaybackTones = useMemo(
    () => playbackTonesForStaffs(playbackModel.tones, visibleDetectionStaffs),
    [playbackModel.tones, visibleDetectionStaffs]
  );
  const detectionPlaybackModelRef = useRef(playbackModel);
  const detectionBpmRef = useRef(bpm);
  const detectionExpectedEventsRef = useRef(expectedDetectionEvents);
  const hasExpectedDetectionEvents = expectedDetectionEvents.length > 0;
  const armGuidedPractice = useCallback(() => {
    const positionMs = tickToElapsedMs(playbackModel, currentTickRef.current, bpm);
    const expected = expectedEventAtOrAfter(expectedDetectionEvents, positionMs)
      ?? expectedDetectionEvents[0];
    if (!expected) return false;
    const tick = elapsedMsToTick(playbackModel, expected.onsetMs, bpm);
    guidedEventIdRef.current = expected.eventId;
    currentTickRef.current = tick;
    setCurrentTick(tick);
    applyHighlights(tick);
    const position = playbackPositionAtTick(playbackModel, tick);
    if (position) {
      setBeatMeasure(position.measure.number);
      setBeatCount(Math.floor(position.offsetTicks / position.measure.beatTicks) + 1);
    }
    return true;
  }, [applyHighlights, bpm, expectedDetectionEvents, playbackModel]);
  const performanceMetrics = useMemo(
    () => scorePracticePerformance(performanceResults.values()),
    [performanceResults]
  );
  const notationFeedback = useMemo(
    () => notationFeedbackByEvent(visibleFeedbackResults.values()),
    [visibleFeedbackResults]
  );
  const feedbackByBeatId = useMemo(
    () => chordFeedbackByBeat(visibleFeedbackResults.values()),
    [visibleFeedbackResults]
  );
  const recentPerformanceResults = useMemo(
    () => [...performanceResults.values()]
      .filter(result => result.status !== "waiting")
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 4),
    [performanceResults]
  );
  const handleDetectionSnapshot = useCallback((snapshot: PracticeAudioDebugSnapshot) => {
    setPerformanceResults(current => mergePerformanceResults(current, snapshot.results));
    setVisibleFeedbackResults(current => mergePerformanceResults(current, snapshot.results));
    snapshot.results
      .filter(result => result.status !== "waiting")
      .forEach(result => {
        const existingTimer = feedbackExpiryTimersRef.current.get(result.eventId);
        if (existingTimer) clearTimeout(existingTimer);
        const timestamp = result.timestamp;
        const timer = setTimeout(() => {
          setVisibleFeedbackResults(current => {
            const visible = current.get(result.eventId);
            if (!visible || visible.timestamp !== timestamp) return current;
            const next = new Map(current);
            next.delete(result.eventId);
            return next;
          });
          feedbackExpiryTimersRef.current.delete(result.eventId);
        }, MUSICAL_FEEDBACK_HOLD_MS);
        feedbackExpiryTimersRef.current.set(result.eventId, timer);
      });

    if (playbackModeRef.current !== "follow" || !isPlayingRef.current) return;
    const currentEventId = guidedEventIdRef.current;
    const accepted = snapshot.results.find(result =>
      currentEventId !== null && guidedResultIsAccepted(result, currentEventId)
    );
    if (!accepted || !currentEventId) return;

    const next = nextExpectedEvent(detectionExpectedEventsRef.current, currentEventId);
    if (!next) {
      guidedEventIdRef.current = null;
      const completedTick = detectionPlaybackModelRef.current.totalTicks;
      currentTickRef.current = completedTick;
      setCurrentTick(completedTick);
      applyHighlights(completedTick);
      setIsPlaying(false);
      setBeatCount(0);
      setBeatMeasure(0);
      return;
    }

    guidedEventIdRef.current = next.eventId;
    const nextTick = elapsedMsToTick(
      detectionPlaybackModelRef.current,
      next.onsetMs,
      detectionBpmRef.current
    );
    currentTickRef.current = nextTick;
    setCurrentTick(nextTick);
    applyHighlights(nextTick);
    const position = playbackPositionAtTick(detectionPlaybackModelRef.current, nextTick);
    if (position) {
      setBeatMeasure(position.measure.number);
      setBeatCount(Math.floor(position.offsetTicks / position.measure.beatTicks) + 1);
    }
  }, [applyHighlights]);

  useEffect(() => () => {
    feedbackExpiryTimersRef.current.forEach(timer => clearTimeout(timer));
    feedbackExpiryTimersRef.current.clear();
  }, []);

  useEffect(() => {
    feedbackIdsRef.current.forEach(id => {
      if (!notationFeedback.has(id)) {
        setRenderedNoteFeedback(renderedNotesRef.current, id, null);
      }
    });
    notationFeedback.forEach((feedback, id) => {
      setRenderedNoteFeedback(renderedNotesRef.current, id, feedback);
    });
    feedbackIdsRef.current = new Set(notationFeedback.keys());
  }, [notationFeedback, renderedNotes]);

  useEffect(() => {
    detectionPlaybackModelRef.current = playbackModel;
    detectionBpmRef.current = bpm;
    detectionExpectedEventsRef.current = expectedDetectionEvents;
    audioDetectorRef.current?.setExpectedEvents(expectedDetectionEvents);
  }, [bpm, expectedDetectionEvents, playbackModel]);

  useEffect(() => {
    if (!isDetectionEnabled || !hasExpectedDetectionEvents) {
      audioDetectorRef.current?.stop();
      audioDetectorRef.current = null;
      return;
    }
    const detector = new PracticeAudioDetector(
      getAudioContext(),
      detectionExpectedEventsRef.current,
      () => tickToElapsedMs(
        detectionPlaybackModelRef.current,
        currentTickRef.current,
        detectionBpmRef.current
      ),
      handleDetectionSnapshot
    );
    audioDetectorRef.current = detector;
    void detector.start().catch(error => {
      detector.stop();
      if (audioDetectorRef.current === detector) audioDetectorRef.current = null;
      setIsDetectionEnabled(false);
      if (playbackModeRef.current === "follow") setIsPlaying(false);
      setDetectionError(error instanceof Error ? error.message : "Microphone access failed");
    });
    return () => {
      detector.stop();
      if (audioDetectorRef.current === detector) audioDetectorRef.current = null;
    };
  }, [getAudioContext, handleDetectionSnapshot, hasExpectedDetectionEvents, isDetectionEnabled]);

  // Sync refs
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    playbackModeRef.current = playbackMode;
  }, [playbackMode]);

  useEffect(() => {
    if (isPlaying && playbackMode !== "follow") {
      const now = performance.now();
      playbackStartTimeRef.current = now;
      playbackStartElapsedRef.current = tickToElapsedMs(
        playbackModel,
        currentTickRef.current,
        bpm
      );
      includeStartingBeatRef.current = true;
    }
  }, [isPlaying, bpm, playbackMode, playbackModel]);

  useEffect(() => {
    if (!isPlaying || playbackMode !== "metronome") {
      cancelScheduledClicks();
      return;
    }

    const context = getAudioContext();
    const scheduledIds = new Set<string>();
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    const scheduleWindow = () => {
      if (cancelled) return;
      const transportElapsedMs = playbackStartElapsedRef.current +
        performance.now() - playbackStartTimeRef.current;
      const beats = metronomeBeatsInWindow(
        metronomeSchedule,
        transportElapsedMs - METRONOME_LATE_GRACE_MS,
        transportElapsedMs + METRONOME_LOOKAHEAD_MS
      );
      beats.forEach(beat => {
        if (scheduledIds.has(beat.id)) return;
        const audioTime = context.currentTime + Math.max(
          METRONOME_MINIMUM_LEAD_SECONDS,
          (beat.elapsedMs - transportElapsedMs) / 1000
        );
        scheduleClick(beat.accent, audioTime);
        scheduledIds.add(beat.id);
      });
    };

    void context.resume().then(() => {
      if (cancelled) return;
      scheduleWindow();
      intervalId = setInterval(scheduleWindow, METRONOME_SCHEDULER_INTERVAL_MS);
    }).catch(error => {
      console.warn("AudioContext metronome scheduler failed to start: ", error);
    });

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
      cancelScheduledClicks();
    };
  }, [bpm, cancelScheduledClicks, getAudioContext, isPlaying, metronomeSchedule, playbackMode, scheduleClick]);

  useEffect(() => {
    let animId: number;
    
    const loop = (time: number) => {
      if (!isPlayingRef.current || playbackModeRef.current === "follow") return;

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
        visiblePlaybackTones.forEach(tone => {
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
      setCurrentTick(nextT);
      applyHighlights(nextT);

      // Derive visual scrolling from the transport clock without using the
      // engraved position as musical time.
      const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
      const targetX = playbackSequence
        ? playbackTickToPrintedX(nextT)
        : tickToX(nextT, positionedSegments);
      const { distance } = playbackScrollDistance(
        targetX,
        viewportWidth,
        positionedSegments[1]?.x
      );
      displayXRef.current = distance;
      const computedOffset = -distance;
      
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
        guidedEventIdRef.current = null;
        pianoOutputRef.current?.allNotesOff();
        scheduledToneIdsRef.current.clear();
        clearHighlights();
        if (!isDetectionEnabled) void audioContextRef.current?.suspend();
      } else {
        animId = requestAnimationFrame(loop);
      }
    };

    if (isPlaying && playbackMode !== "follow") {
      animId = requestAnimationFrame(loop);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [applyHighlights, bpm, clearHighlights, getAudioContext, isDetectionEnabled, isPlaying, playbackMode, playbackModel, playbackSequence, playbackTickToPrintedX, positionedSegments, renderer, totalTicks, visiblePlaybackTones]);

  // Sync visual offsets when song/tick changes while not playing or dragging
  useEffect(() => {
    if (!isDragging && preserveOffsetAfterDragRef.current) {
      preserveOffsetAfterDragRef.current = false;
      return;
    }

    if ((!isPlaying || playbackMode === "follow") && !isDragging) {
      const targetX = playbackSequence
        ? playbackTickToPrintedX(currentTick)
        : tickToX(currentTick, positionedSegments);
      const viewportWidth = viewportRef.current ? viewportRef.current.getBoundingClientRect().width : 0;
      const { distance } = playbackScrollDistance(
        targetX,
        viewportWidth,
        positionedSegments[1]?.x
      );
      displayXRef.current = distance;
      const computedOffset = -distance;

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
  }, [currentTick, positionedSegments, isPlaying, isDragging, playbackMode, playbackSequence, playbackTickToPrintedX, renderer]);

  // Generate dynamic string label based on tuning configuration
  const getStringLabels = () => {
    if (parsedInst && parsedInst.tuning) {
      return parsedInst.tuning.map((t: string) => t.replace(/\d+/, "")).join(" ");
    }
    return "G C E A";
  };

  // Calculate Title & Author metadata to display in the header. The stored
  // score filename is authoritative when EasyScore metadata has no title.
  const getActiveScoreHeaderDetails = () => {
    if (!activeScore) return { title: "No Song Selected", subtitle: "" };

    let displayTitle = activeScore.title;
    let displaySubtitle = "";

    if (parsedSong?.metadata) {
      if (parsedSong.metadata.title?.trim()) {
        displayTitle = parsedSong.metadata.title.trim();
      }
      if (parsedSong.metadata.writers && parsedSong.metadata.writers.length > 0) {
        displaySubtitle = Array.isArray(parsedSong.metadata.writers)
          ? parsedSong.metadata.writers.join(", ")
          : parsedSong.metadata.writers;
      } else if (parsedSong.metadata.author) {
        displaySubtitle = parsedSong.metadata.author;
      }
    }

    if (!displaySubtitle && activeScore.author && activeScore.author !== "Unknown") {
      displaySubtitle = activeScore.author;
    }

    return { title: displayTitle, subtitle: displaySubtitle };
  };

  const { title: displayHeaderTitle, subtitle: displayHeaderSubtitle } = getActiveScoreHeaderDetails();

  const saveActiveScoreTitle = async () => {
    const nextTitle = editedTitle.trim();
    if (!nextTitle || !activeScore || !parsedSong || !user || !token) return;

    setIsSavingTitle(true);
    setTitleSaveError(null);
    const updatedDocument: EasyScoreDocument = {
      ...parsedSong,
      metadata: {
        ...parsedSong.metadata,
        title: nextTitle,
      },
    };
    const scoreRepresentation = JSON.stringify(updatedDocument);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/users/${user.id}/scores/${activeScore.id}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ scoreRepresentation }),
        }
      );
      if (!response.ok) {
        throw new Error(`Title save failed with status ${response.status}`);
      }
      setActiveScoreData(scoreRepresentation);
      setIsEditingTitle(false);
    } catch (error) {
      setTitleSaveError(error instanceof Error ? error.message : "Unable to save title");
    } finally {
      setIsSavingTitle(false);
    }
  };

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
              {isEditingTitle ? (
                <form
                  className="flex items-center gap-2"
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void saveActiveScoreTitle();
                  }}
                >
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(event) => setEditedTitle(event.target.value)}
                    className="w-64 max-w-[45vw] rounded-md border border-indigo-500 bg-neutral-950 px-2 py-1 text-sm font-bold text-neutral-100 outline-none focus:border-indigo-300"
                    aria-label="Score title"
                    autoFocus
                  />
                  <button
                    type="submit"
                    disabled={!editedTitle.trim() || isSavingTitle}
                    className="rounded-md bg-indigo-600 px-2 py-1 text-[9px] font-black uppercase tracking-wide text-white hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {isSavingTitle ? "Saving" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditingTitle(false);
                      setTitleSaveError(null);
                    }}
                    className="rounded-md bg-neutral-800 px-2 py-1 text-[9px] font-bold uppercase text-neutral-300 hover:bg-neutral-700"
                  >
                    Cancel
                  </button>
                </form>
              ) : (
                <h2 className="text-sm sm:text-base font-extrabold text-neutral-100 truncate flex items-center gap-2">
                  {displayHeaderTitle}
                  {displayHeaderSubtitle && (
                    <span className="text-xs font-normal text-neutral-400">by {displayHeaderSubtitle}</span>
                  )}
                  {canEditActiveScoreTitle && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditedTitle(displayHeaderTitle);
                        setTitleSaveError(null);
                        setIsEditingTitle(true);
                      }}
                      className="shrink-0 rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-indigo-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                      aria-label="Edit score title"
                      title="Edit score title"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                      </svg>
                    </button>
                  )}
                </h2>
              )}
              {titleSaveError && (
                <span className="text-[10px] text-rose-400">{titleSaveError}</span>
              )}
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
        <div className="flex-1 flex items-center justify-center min-h-0 px-12">
          <div
            className={`w-full relative ${
              notationStaffCount > 2
                ? "h-[92%] max-h-[520px]"
                : "h-[85%] max-h-[360px]"
            }`}
          >
            {renderer === notationPracticeRenderer && (
              <button
                type="button"
                onClick={() => setShowMeasureNumbers(current => !current)}
                aria-pressed={showMeasureNumbers}
                title={`${showMeasureNumbers ? "Hide" : "Show"} measure numbers`}
                className={`absolute right-2 top-2 z-40 rounded border px-2 py-1 text-[9px] font-semibold tracking-wide transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                  showMeasureNumbers
                    ? "border-indigo-400/60 bg-indigo-950/90 text-indigo-200"
                    : "border-neutral-700 bg-neutral-900/80 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200"
                }`}
              >
                Measure #
              </button>
            )}
            {showsPianoHandControls && (
              <div className="absolute left-full ml-2 inset-y-0 z-40 w-8" aria-label="Piano hand visibility">
                {(["right", "left"] as const).map((hand, index) => {
                  const isDisabled = hiddenHand !== null && hiddenHand !== hand;
                  const isVisible = hiddenHand !== hand;
                  const staffCenter = NOTATION_LAYOUT.top + 60 + index * NOTATION_LAYOUT.staffGap;
                  return (
                    <button
                      key={hand}
                      type="button"
                      onClick={() => {
                        pianoOutputRef.current?.allNotesOff();
                        scheduledToneIdsRef.current.clear();
                        includeStartingBeatRef.current = true;
                        setHandVisibility(current => ({
                          scoreId: activeScore?.id ?? null,
                          hiddenHand: toggleHiddenHand(
                            current.scoreId === (activeScore?.id ?? null)
                              ? current.hiddenHand
                              : null,
                            hand
                          ),
                        }));
                      }}
                      disabled={isDisabled}
                      aria-label={`${isVisible ? "Hide" : "Show"} ${hand} hand score`}
                      aria-pressed={isVisible}
                      title={`${isVisible ? "Hide" : "Show"} ${hand} hand score`}
                      className={`absolute left-0 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md border bg-neutral-900/90 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 ${
                        isDisabled
                          ? "cursor-not-allowed border-neutral-600 text-neutral-600"
                          : "border-white text-white hover:bg-neutral-800"
                      }`}
                      style={{ top: staffCenter }}
                    >
                      <HandSilhouette hand={hand} />
                    </button>
                  );
                })}
              </div>
            )}
            <div
              ref={viewportRef}
              className="h-full w-full bg-neutral-950 border border-neutral-850 rounded-2xl relative flex overflow-hidden"
              style={{ boxShadow: 'inset 0 2px 15px var(--theme-viewport-inner-shadow)' }}
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
                        transition: isDragging || isPlaying
                          ? "none"
                          : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      className="h-full w-max shrink-0 relative"
                    >
                      {renderer.renderContinuous(displaySong, positionedSegments, {
                        isPlaying,
                        beatCount,
                        currentTick,
                        offsetX,
                        viewportWidth,
                        segments: positionedSegments,
                        parsedInst,
                        onRenderedNotes: handleRenderedNotes,
                        feedbackByBeatId,
                        showMeasureNumbers,
                      })}
                    </div>
                    {renderer.renderStationaryOverlay?.(displaySong, positionedSegments, {
                      isPlaying,
                      beatCount,
                      currentTick,
                      offsetX,
                      viewportWidth,
                      segments: positionedSegments,
                      parsedInst,
                      onRenderedNotes: handleRenderedNotes,
                      feedbackByBeatId,
                    })}
                    {hiddenHand && (
                      <div
                        className="absolute inset-x-0 z-30 bg-neutral-950 pointer-events-none"
                        aria-hidden="true"
                        style={hiddenHand === "right"
                          ? {
                              top: 0,
                              height: NOTATION_LAYOUT.top + 40 + NOTATION_LAYOUT.staffGap / 2,
                            }
                          : {
                              top: NOTATION_LAYOUT.top + 40 + NOTATION_LAYOUT.staffGap / 2,
                              bottom: 0,
                            }}
                      />
                    )}
                  </div>
                ) : (
                  <div
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    className="flex-1 h-full flex items-center select-none cursor-grab active:cursor-grabbing overflow-hidden relative z-10"
                  >
                    <div
                      style={{
                        transform: `translateX(${offsetX}px)`,
                        transition: isDragging || isPlaying
                          ? "none"
                          : "transform 0.25s cubic-bezier(0.16, 1, 0.3, 1)",
                      }}
                      className="flex flex-row h-full w-max shrink-0 relative"
                    >
                      <div
                        className="h-full shrink-0"
                        style={{ width: `${segmentedRenderWindow.left}px` }}
                        aria-hidden="true"
                      />
                      {positionedSegments
                        .slice(
                          segmentedRenderWindow.startIndex,
                          segmentedRenderWindow.endIndex + 1
                        )
                        .map((segment) => {
                        if (!renderer) return null;
                        return renderer.renderSegment(segment, {
                          isPlaying,
                          beatCount,
                          currentTick,
                          offsetX,
                          segments: positionedSegments,
                          parsedInst,
                          feedbackByBeatId,
                        });
                      })}
                      <div
                        className="h-full shrink-0"
                        style={{
                          width: `${Math.max(
                            0,
                            (positionedSegments.at(-1)?.x ?? 0) +
                              (positionedSegments.at(-1)?.width ?? 0) -
                              segmentedRenderWindow.right
                          )}px`,
                        }}
                        aria-hidden="true"
                      />
                    </div>
                  </div>
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
              <button
                type="button"
                onClick={() => {
                  setDetectionError(null);
                  if (isDetectionEnabled) {
                    setIsDetectionEnabled(false);
                    if (playbackMode === "follow") {
                      playbackModeRef.current = "highlight";
                      setPlaybackMode("highlight");
                      guidedEventIdRef.current = null;
                    }
                    return;
                  }
                  setPerformanceResults(new Map());
                  setVisibleFeedbackResults(new Map());
                  feedbackExpiryTimersRef.current.forEach(timer => clearTimeout(timer));
                  feedbackExpiryTimersRef.current.clear();
                  if (playbackMode === "tonal") {
                    pianoOutputRef.current?.allNotesOff();
                    scheduledToneIdsRef.current.clear();
                    setPlaybackMode("highlight");
                    showSynthMicWarning();
                  }
                  setIsDetectionEnabled(true);
                }}
                disabled={expectedDetectionEvents.length === 0}
                className={`rounded-md px-2 py-1 text-[9px] font-extrabold uppercase tracking-wide transition-colors disabled:opacity-40 ${
                  isDetectionEnabled
                    ? "bg-emerald-700 text-white"
                    : "bg-neutral-800 text-neutral-400 hover:text-emerald-300"
                }`}
                title="Enable score-guided microphone detection"
              >
                {isDetectionEnabled ? "Mic on" : "Mic detect"}
              </button>
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

          <div className="grid grid-cols-4 gap-1 rounded-lg bg-neutral-950/70 p-1 border border-neutral-800">
            {([
              ["highlight", "Highlight"],
              ["metronome", "Metronome"],
              ["tonal", "Synth"],
              ["follow", "Follow"],
            ] as const).map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  cancelScheduledClicks();
                  pianoOutputRef.current?.allNotesOff();
                  scheduledToneIdsRef.current.clear();
                  setIsFlashing(false);
                  if (mode === "tonal" && isDetectionEnabled) {
                    setIsDetectionEnabled(false);
                    showSynthMicWarning();
                  }
                  if (mode === "follow") {
                    setIsDetectionEnabled(true);
                    armGuidedPractice();
                  } else {
                    guidedEventIdRef.current = null;
                  }
                  playbackModeRef.current = mode;
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
                title={mode === "follow"
                  ? "Hold on each expected note or chord until you play it correctly"
                  : `${label} playback mode`}
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
                    if (playbackMode === "follow") {
                      if (!armGuidedPractice()) return;
                      setIsDetectionEnabled(true);
                    }
                    playbackHasStartedRef.current = true;
                    scheduledToneIdsRef.current.clear();
                    if (playbackMode !== "highlight" && playbackMode !== "follow") {
                      const ctx = getAudioContext();
                      void ctx.resume();
                    }
                  }
                  setIsPlaying(nextPlaying);
                  if (!nextPlaying) {
                    cancelScheduledClicks();
                    setIsFlashing(false);
                    setCurrentTick(currentTickRef.current);
                    pianoOutputRef.current?.allNotesOff();
                    scheduledToneIdsRef.current.clear();
                    if (!isDetectionEnabled) void audioContextRef.current?.suspend();
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
                cancelScheduledClicks();
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
                guidedEventIdRef.current = null;
                pianoOutputRef.current?.allNotesOff();
                scheduledToneIdsRef.current.clear();
                setPerformanceResults(new Map());
                setVisibleFeedbackResults(new Map());
                feedbackExpiryTimersRef.current.forEach(timer => clearTimeout(timer));
                feedbackExpiryTimersRef.current.clear();
                clearHighlights();
                if (!isDetectionEnabled) void audioContextRef.current?.suspend();
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
                  cancelScheduledClicks();
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
                {isDetectionEnabled ? "Live" : "Awaiting microphone"}
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-2">
              {[
                ["Tonality", performanceMetrics.scoredEvents > 0
                  ? `${Math.round(performanceMetrics.noteAccuracy * 100)}%`
                  : "—"],
                ["Timing precision", performanceMetrics.scoredEvents > 0
                  ? `${Math.round(performanceMetrics.timingPrecision * 100)}%`
                  : "—"],
                ["Accuracy", performanceMetrics.scoredEvents > 0
                  ? `${Math.round(performanceMetrics.overallAccuracy * 100)}%`
                  : "—"],
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
              {detectionError && (
                <div className="mb-2 rounded-md border border-rose-900/60 bg-rose-950/20 p-2 text-[9px] text-rose-300">
                  {detectionError}
                </div>
              )}
              <div className="mb-1 text-[8px] font-bold uppercase tracking-widest text-neutral-600">
                {isDetectionEnabled ? "Recent performance" : "Performance feedback"}
              </div>
              {isDetectionEnabled ? (
                recentPerformanceResults.length > 0 ? (
                  <ul className="space-y-1">
                    {recentPerformanceResults.map(result => (
                      <li
                        key={result.eventId}
                        className="flex items-center justify-between gap-3 rounded-md bg-neutral-900/80 px-2 py-1 text-[9px] text-neutral-300"
                      >
                        <span className="truncate font-medium">
                          {musicalFeedbackMessage(result, midiLabel)}
                        </span>
                        <span className={`shrink-0 font-bold uppercase ${
                          result.status === "correct" ? "text-emerald-400" :
                            result.status === "early" || result.status === "late" ? "text-amber-300" :
                              "text-rose-400"
                        }`}>
                          {result.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-md bg-neutral-900/60 px-2 py-2 text-[10px] text-neutral-500">
                    Start playback and play the expected notes to build performance feedback.
                  </div>
                )
              ) : (
                <div className="rounded-md bg-neutral-900/60 px-2 py-2 text-[10px] text-neutral-500">
                  Enable Mic detect to measure note accuracy, timing precision, and unwanted notes.
                </div>
              )}
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
                  <button
                    type="button"
                    key={`dict-chord-${chord}`}
                    onClick={() => setExpandedChord(chord)}
                    aria-label={`Open enlarged ${chord} chord diagram`}
                    className="flex flex-col items-center shrink-0 w-[74px] h-[102px] bg-neutral-950 border border-neutral-850 hover:border-indigo-500/60 hover:bg-neutral-900 rounded-xl transition-all select-none pt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                  >
                    <span className="text-[10px] font-black text-neutral-300 leading-none tracking-wider mb-0.5">
                      {chord}
                    </span>
                    <span className="text-[6.5px] font-extrabold text-neutral-300 uppercase tracking-widest leading-none mb-0.5">
                      {getStringLabels()}
                    </span>
                    <div
                      className="chord-diagram-container inline-chordbox flex-1 flex items-center justify-center"
                      data-chord={chord}
                      style={{ width: "64px", height: "72px" }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {expandedChord && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setExpandedChord(null);
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="expanded-chord-title"
            className="flex w-full max-w-sm flex-col items-center rounded-2xl border border-indigo-500/40 bg-neutral-950 px-8 py-6 shadow-2xl shadow-indigo-950/50"
          >
            <h2
              id="expanded-chord-title"
              className="text-2xl font-black text-indigo-200"
            >
              {expandedChord}
            </h2>
            <span className="mt-1 text-xs font-extrabold uppercase tracking-[0.35em] text-neutral-300">
              {getStringLabels()}
            </span>
            <div
              className="chord-diagram-container mt-3 flex items-center justify-center"
              data-chord={expandedChord}
              data-expanded="true"
              style={{ width: "220px", height: "250px" }}
            />
            <span className="mt-2 text-[10px] uppercase tracking-widest text-neutral-600">
              Click outside to close
            </span>
          </section>
        </div>
      )}

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

      {isSynthMicWarningOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="synth-mic-warning-title"
            aria-describedby="synth-mic-warning-description"
            className="w-full max-w-sm rounded-2xl border border-neutral-700 bg-neutral-900 p-5 shadow-2xl shadow-black/60"
          >
            <h2 id="synth-mic-warning-title" className="text-sm font-black uppercase tracking-wider text-neutral-100">
              Synth and Mic cannot run together
            </h2>
            <p id="synth-mic-warning-description" className="mt-2 text-xs leading-relaxed text-neutral-400">
              Synth playback during a listening event can be picked up by the microphone and interfere with the app&apos;s ability to evaluate your performance. The previous option has been turned off.
            </p>

            <label className="mt-4 flex cursor-pointer items-center gap-2 text-xs text-neutral-300">
              <input
                type="checkbox"
                checked={dontShowSynthMicWarningAgain}
                onChange={event => setDontShowSynthMicWarningAgain(event.target.checked)}
                className="h-4 w-4 rounded accent-indigo-500"
              />
              Don&apos;t show me this again
            </label>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={dismissSynthMicWarning}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-xs font-extrabold uppercase tracking-wide text-white transition-colors hover:bg-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
              >
                Okay
              </button>
            </div>
          </section>
        </div>
      )}

    </main>
  );
}
