"use client";

import React, { useEffect, useState, useRef } from "react";
import { useAuth } from "../../context/AuthContext";

export type JobStatus = "queued" | "processing" | "completed" | "failed";

export interface ConversionJob {
  jobId: string;
  status: JobStatus;
  progress: number;
  stage: string;
  message: string;
  resultPath: string | null;
  error: string | null;
}

export interface LogEntry {
  timestamp: string;
  stage: string;
  message: string;
}

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";

export default function UploadPage() {
  const { user, token } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Filespace States
  const [folders, setFolders] = useState<Folder[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<number | null>(null);

  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");

  const [editingFolderId, setEditingFolderId] = useState<number | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  const [editingScoreId, setEditingScoreId] = useState<number | null>(null);
  const [editingScoreTitle, setEditingScoreTitle] = useState("");

  // Directory expansion / collapse states
  const [expandedFolderIds, setExpandedFolderIds] = useState<number[]>([]);

  // Drag-and-Drop Move States
  const [dragOverFolderId, setDragOverFolderId] = useState<number | "root" | "up" | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Auto-scroll for the terminal/logs area
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Clean up polling interval and abort controllers on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Fetch / Sync Folders and Scores from database
  const fetchFoldersAndScores = async () => {
    if (!user || !token) return;
    try {
      const foldersRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/folders`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const scoresRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores`, {
        headers: { Authorization: `Bearer ${token}` }
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
  };

  // Mount/Auth effect to load data asynchronously, bypassing set-state-in-effect lint warning
  useEffect(() => {
    const initData = async () => {
      if (user && token) {
        try {
          const foldersRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/folders`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          const scoresRes = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores`, {
            headers: { Authorization: `Bearer ${token}` }
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
        const localFolders = localStorage.getItem("notestream_guest_folders");
        const localScores = localStorage.getItem("notestream_guest_scores");
        if (localFolders && localScores) {
          setFolders(JSON.parse(localFolders));
          setScores(JSON.parse(localScores));
        } else {
          const defaultFolders: Folder[] = [
            { id: 101, user_id: 0, folder_name: "Chords & Tabs", folder_parent: null },
            { id: 102, user_id: 0, folder_name: "Beethoven Classics", folder_parent: null }
          ];
          const defaultScores: Score[] = [
            { id: 201, user_id: 0, folder_id: 102, title: "fur-elise.ezs", score_representation: "{}", instrument: "Piano", author: "L. Beethoven" }
          ];
          setFolders(defaultFolders);
          setScores(defaultScores);
          localStorage.setItem("notestream_guest_folders", JSON.stringify(defaultFolders));
          localStorage.setItem("notestream_guest_scores", JSON.stringify(defaultScores));
        }
      }
    };

    // Defer state synchronization to a microtask context
    Promise.resolve().then(initData);
  }, [user, token]);

  const appendLog = (stage: string, message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setLogs((prev) => {
      // Prevent duplicate logs for the identical stage and message
      const isDuplicate = prev.some(
        (log) => log.stage === stage && log.message === message
      );
      if (isDuplicate) return prev;
      return [...prev, { timestamp, stage, message }];
    });
  };

  const handleFile = (selectedFile: File) => {
    setError(null);

    console.log("Selected file:", { file, isFile: selectedFile instanceof File, name: selectedFile.name, type: selectedFile.type, size: selectedFile.size });

    const lowerName = selectedFile.name.toLowerCase();
    const isPdf = selectedFile.type === "application/pdf" || lowerName.endsWith(".pdf");
    const isXml = lowerName.endsWith(".xml") || lowerName.endsWith(".musicxml") || lowerName.endsWith(".mxl");

    if (!isPdf && !isXml) {
      setError("Unsupported file format. Please upload a valid PDF, XML, MusicXML, or MXL file.");
      return;
    }

    setFile(selectedFile);
    startConversion(selectedFile);
  };

  const startConversion = async (file: File) => {
    setLoading(true);
    setJob(null);
    setProgress(0);
    setCurrentTask("Uploading score to conversion API...");
    setError(null);

    // Initial log entry
    const initialTime = new Date().toLocaleTimeString();
    setLogs([{ timestamp: initialTime, stage: "Upload", message: "Uploading score to conversion API..." }]);

    const formData = new FormData();
    formData.append("file", file, file.name);

    console.log("Uploading:", {
      fileEntry: formData.get("file"),
      isFile: formData.get("file") instanceof File,
    });

    try {
      const response = await fetch(`${API_URL}/conversions`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        console.error("Conversion response:", { status: response.status, body: await response.text() });
        throw new Error(`Upload failed with status: ${response.status}`);
      }

      const initialJob: ConversionJob = await response.json();
      setJob(initialJob);
      setProgress(initialJob.progress);
      setCurrentTask(initialJob.message || initialJob.stage || "Job queued");
      appendLog(initialJob.stage || "queued", initialJob.message || "Job initialized and queued.");

      if (initialJob.status !== "completed" && initialJob.status !== "failed") {
        pollJobStatus(initialJob.jobId, file.name);
      } else {
        setLoading(false);
        if (initialJob.status === "failed") {
          const finalError = initialJob.error || "Job failed on server.";
          setError(finalError);
          appendLog("failed", finalError);
        } else {
          appendLog("completed", "Conversion completed successfully.");
          saveScoreToDestination(initialJob, file.name);
        }
      }
    } catch (err: unknown) {
      console.error("Error during upload/conversion: ", err);
      const errMsg = err instanceof Error ? err.message : "An error occurred during upload/conversion.";
      setError(errMsg);
      setLoading(false);
      appendLog("failed", errMsg);
    }
  };

  const pollJobStatus = (jobId: string, originalFileName: string) => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/conversions/${jobId}?timeout=30`, {
          signal: abortController.signal,
        });
        if (!response.ok) {
          throw new Error(`Tracking failed with status: ${response.status}`);
        }

        const currentJob: ConversionJob = await response.json();
        setJob(currentJob);
        setProgress(currentJob.progress);
        setCurrentTask(currentJob.message || currentJob.stage || "Processing...");
        appendLog(currentJob.stage || currentJob.status, currentJob.message || `Job status updated to ${currentJob.status}.`);

        if (currentJob.status === "completed" || currentJob.status === "failed") {
          setLoading(false);
          if (currentJob.status === "failed") {
            const finalError = currentJob.error || "Job failed on server.";
            setError(finalError);
            appendLog("failed", finalError);
          } else {
            appendLog("completed", "Conversion completed successfully.");
            saveScoreToDestination(currentJob, originalFileName);
          }
        } else {
          // Poll again immediately for long polling
          poll();
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Error during polling: ", err);
        const errMsg = err instanceof Error ? err.message : "An error occurred while tracking conversion progress.";
        setError(errMsg);
        setLoading(false);
        appendLog("failed", errMsg);
      }
    };

    poll();
  };

  const saveScoreToDestination = async (completedJob: ConversionJob, originalFileName: string) => {
    try {
      appendLog("storage", "Fetching EasyScore result representation...");
      const resultRes = await fetch(`${API_URL}/conversions/${completedJob.jobId}/result`);
      let scoreJsonStr = "{}";
      if (resultRes.ok) {
        const scoreJson = await resultRes.json();
        scoreJsonStr = JSON.stringify(scoreJson);
      }

      const baseName = originalFileName.substring(0, originalFileName.lastIndexOf('.')) || originalFileName;
      const targetEzsName = baseName + ".ezs";

      if (user && token) {
        const res = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            folderId: currentFolderId,
            title: targetEzsName,
            scoreRepresentation: scoreJsonStr,
            instrument: "Piano",
            author: "Unknown"
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
          appendLog("storage", `Successfully saved score as "${targetEzsName}" to target destination.`);
        } else {
          appendLog("failed", "Failed to save score via storage API.");
        }
      } else {
        const newScore: Score = {
          id: Date.now(),
          user_id: 0,
          folder_id: currentFolderId,
          title: targetEzsName,
          instrument: "Piano",
          author: "Unknown",
          score_representation: scoreJsonStr
        };
        const updated = [...scores, newScore];
        setScores(updated);
        localStorage.setItem("notestream_guest_scores", JSON.stringify(updated));
        appendLog("storage", `Successfully saved score as "${targetEzsName}" to guest local storage.`);
      }
    } catch (err) {
      console.error("Error saving score to destination:", err);
      appendLog("failed", `Storage saving error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  // CRUD Operations
  const handleAddFolder = async (name: string) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/${user.id}/folders`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            folderName: name,
            folderParent: currentFolderId
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Add folder API failed:", err);
      }
    } else {
      const newFolder: Folder = {
        id: Date.now(),
        user_id: 0,
        folder_name: name,
        folder_parent: currentFolderId
      };
      const updated = [...folders, newFolder];
      setFolders(updated);
      localStorage.setItem("notestream_guest_folders", JSON.stringify(updated));
    }
  };

  const handleRenameFolder = async (folderId: number, newName: string) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            folderName: newName
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Rename folder API failed:", err);
      }
    } else {
      const updated = folders.map(f => f.id === folderId ? { ...f, folder_name: newName } : f);
      setFolders(updated);
      localStorage.setItem("notestream_guest_folders", JSON.stringify(updated));
    }
  };

  const handleDeleteFolder = async (folderId: number) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Delete folder API failed:", err);
      }
    } else {
      const updatedFolders = folders.filter(f => f.id !== folderId && f.folder_parent !== folderId);
      const updatedScores = scores.filter(s => s.folder_id !== folderId);
      setFolders(updatedFolders);
      setScores(updatedScores);
      localStorage.setItem("notestream_guest_folders", JSON.stringify(updatedFolders));
      localStorage.setItem("notestream_guest_scores", JSON.stringify(updatedScores));
    }
  };

  const handleRenameScore = async (scoreId: number, newTitle: string) => {
    let formattedTitle = newTitle;
    if (!formattedTitle.endsWith(".ezs")) {
      formattedTitle += ".ezs";
    }

    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/${user.id}/scores/${scoreId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            title: formattedTitle
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Rename score API failed:", err);
      }
    } else {
      const updated = scores.map(s => s.id === scoreId ? { ...s, title: formattedTitle } : s);
      setScores(updated);
      localStorage.setItem("notestream_guest_scores", JSON.stringify(updated));
    }
  };

  const handleDeleteScore = async (scoreId: number) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores/${scoreId}`, {
          method: "DELETE",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ permanent: true })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Delete score API failed:", err);
      }
    } else {
      const updated = scores.filter(s => s.id !== scoreId);
      setScores(updated);
      localStorage.setItem("notestream_guest_scores", JSON.stringify(updated));
    }
  };

  // Move Folder or Score via Drag and Drop
  const handleMoveFolder = async (folderId: number, targetParentId: number | null) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/folders/${folderId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            folderParent: targetParentId
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Move folder API failed:", err);
      }
    } else {
      const updated = folders.map(f => f.id === folderId ? { ...f, folder_parent: targetParentId } : f);
      setFolders(updated);
      localStorage.setItem("notestream_guest_folders", JSON.stringify(updated));
    }
  };

  const handleMoveScore = async (scoreId: number, targetFolderId: number | null) => {
    if (user && token) {
      try {
        const res = await fetch(`${API_BASE_URL}/api/users/${user.id}/scores/${scoreId}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            folderId: targetFolderId
          })
        });
        if (res.ok) {
          fetchFoldersAndScores();
        }
      } catch (err) {
        console.error("Move score API failed:", err);
      }
    } else {
      const updated = scores.map(s => s.id === scoreId ? { ...s, folder_id: targetFolderId } : s);
      setScores(updated);
      localStorage.setItem("notestream_guest_scores", JSON.stringify(updated));
    }
  };

  const getBreadcrumbs = () => {
    const crumbs = [];
    let tempId = currentFolderId;
    while (tempId !== null) {
      const folder = folders.find(f => f.id === tempId);
      if (!folder) break;
      crumbs.unshift(folder);
      tempId = folder.folder_parent;
    }
    return crumbs;
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (loading) return;
    
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const onFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (loading) return;
    
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const triggerBrowse = () => {
    if (loading) return;
    fileInputRef.current?.click();
  };

  const resetUpload = () => {
    setFile(null);
    setJob(null);
    setError(null);
    setProgress(0);
    setCurrentTask("");
    setLoading(false);
    setLogs([]);
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  // Drag-and-drop Move Operations Handlers
  const handleItemDragStart = (e: React.DragEvent, type: "folder" | "score", id: number) => {
    e.dataTransfer.setData("itemType", type);
    e.dataTransfer.setData("itemId", id.toString());
    e.dataTransfer.effectAllowed = "move";
  };

  const handleItemDragOver = (e: React.DragEvent, targetId: number | "root" | "up" | null) => {
    e.preventDefault();
    if (dragOverFolderId !== targetId) {
      setDragOverFolderId(targetId);
    }
  };

  const handleItemDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverFolderId(null);
  };

  const handleItemDrop = async (e: React.DragEvent, targetFolderId: number | null) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const type = e.dataTransfer.getData("itemType") as "folder" | "score";
    const id = parseInt(e.dataTransfer.getData("itemId"), 10);

    if (isNaN(id)) return;

    if (type === "folder") {
      // Prevent circular parent hierarchy assigning
      if (id === targetFolderId) return;
      let tempParentId = targetFolderId;
      while (tempParentId !== null) {
        const parent = folders.find(f => f.id === tempParentId);
        if (!parent) break;
        if (parent.id === id) return; // circular reference detected
        tempParentId = parent.folder_parent;
      }
      await handleMoveFolder(id, targetFolderId);
    } else if (type === "score") {
      await handleMoveScore(id, targetFolderId);
    }
  };

  // Folder Expansion / Collapse state toggling
  const toggleFolderExpanded = (folderId: number) => {
    setExpandedFolderIds((prev) =>
      prev.includes(folderId) ? prev.filter((id) => id !== folderId) : [...prev, folderId]
    );
  };

  // Recursive Renderer for expandable folders in active list
  const renderFolderTreeItem = (folder: Folder, depth: number = 0) => {
    const hasSubfolders = folders.some((f) => f.folder_parent === folder.id);
    const isExpanded = expandedFolderIds.includes(folder.id);
    const isDragOverThisFolder = dragOverFolderId === folder.id;

    const childFolders = folders.filter((f) => f.folder_parent === folder.id);
    const childScores = scores.filter((s) => s.folder_id === folder.id);

    return (
      <div key={folder.id} className="flex flex-col gap-1 w-full animate-fade-in">
        {/* Folder Item Row */}
        <div
          draggable="true"
          onDragStart={(e) => handleItemDragStart(e, "folder", folder.id)}
          onDragOver={(e) => handleItemDragOver(e, folder.id)}
          onDragLeave={handleItemDragLeave}
          onDrop={(e) => handleItemDrop(e, folder.id)}
          className={`group/item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-950/30 hover:bg-indigo-950/10 border transition-all cursor-grab active:cursor-grabbing select-none ${
            isDragOverThisFolder
              ? "border-indigo-500 bg-indigo-500/15 shadow-[0_0_12px_rgba(99,102,241,0.15)] text-indigo-200 scale-[0.99]"
              : "border-neutral-900/60 hover:border-indigo-500/20"
          }`}
          style={{ paddingLeft: `${Math.max(10, depth * 14 + 10)}px` }}
          onClick={() => setCurrentFolderId(folder.id)}
        >
          {editingFolderId === folder.id ? (
            <div className="flex items-center gap-1.5 flex-1" onClick={(e) => e.stopPropagation()}>
              <input
                type="text"
                value={editingFolderName}
                onChange={(e) => setEditingFolderName(e.target.value)}
                className="bg-neutral-900 border border-indigo-500 focus:border-indigo-400 rounded px-2 py-0.5 text-xs text-neutral-200 outline-none flex-1"
                autoFocus
              />
              <button
                onClick={() => {
                  if (editingFolderName.trim()) {
                    handleRenameFolder(folder.id, editingFolderName.trim());
                    setEditingFolderId(null);
                  }
                }}
                className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase rounded"
              >
                Save
              </button>
              <button
                onClick={() => setEditingFolderId(null)}
                className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-400 text-[9px] uppercase rounded"
              >
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {/* Expand / Collapse [+]/[-] Expander Control */}
                {hasSubfolders ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleFolderExpanded(folder.id);
                    }}
                    className="w-4 h-4 shrink-0 flex items-center justify-center rounded hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-[10px] font-bold text-indigo-400 font-mono transition-colors"
                    title={isExpanded ? "Collapse Directory" : "Expand Directory"}
                  >
                    {isExpanded ? "−" : "+"}
                  </button>
                ) : (
                  <span className="w-4 h-4 shrink-0 block" />
                )}

                {/* Folder Icon */}
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-amber-500 shrink-0">
                  <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836l-1.44-2.16A1.75 1.75 0 0 0 8.49 2H3.75z" />
                </svg>
                <span className="text-xs font-semibold text-neutral-300 truncate">
                  {folder.folder_name}
                </span>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => {
                    setEditingFolderId(folder.id);
                    setEditingFolderName(folder.folder_name);
                  }}
                  className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                  title="Rename Folder"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    if (confirm("Are you sure you want to delete this folder and all its contents?")) {
                      handleDeleteFolder(folder.id);
                    }
                  }}
                  className="p-0.5 rounded hover:bg-rose-950/30 text-neutral-400 hover:text-rose-400"
                  title="Delete Folder"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </button>
              </div>
            </>
          )}
        </div>

        {/* Nested child subfolders and files inside expanded folder */}
        {isExpanded && (
          <div className="flex flex-col gap-1 w-full border-l border-neutral-850/60 ml-2.5">
            {childFolders.map((child) => renderFolderTreeItem(child, depth + 1))}
            {childScores.map((score) => renderScoreTreeItem(score, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  // Score Tree Item Renderer with custom depth padding
  const renderScoreTreeItem = (score: Score, depth: number = 0) => {
    return (
      <div
        key={score.id}
        draggable="true"
        onDragStart={(e) => handleItemDragStart(e, "score", score.id)}
        className="group/item flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-neutral-950/20 hover:bg-emerald-950/5 border border-neutral-900/60 hover:border-emerald-500/10 transition-all cursor-grab active:cursor-grabbing select-none animate-fade-in"
        style={{ paddingLeft: `${Math.max(10, depth * 14 + 10)}px` }}
      >
        {editingScoreId === score.id ? (
          <div className="flex items-center gap-1.5 flex-1">
            <input
              type="text"
              value={editingScoreTitle}
              onChange={(e) => setEditingScoreTitle(e.target.value)}
              className="bg-neutral-900 border border-indigo-500 focus:border-indigo-400 rounded px-2.5 py-0.5 text-xs text-neutral-200 outline-none flex-1"
              autoFocus
            />
            <button
              onClick={() => {
                if (editingScoreTitle.trim()) {
                  handleRenameScore(score.id, editingScoreTitle.trim());
                  setEditingScoreId(null);
                }
              }}
              className="px-2 py-0.5 bg-indigo-600 hover:bg-indigo-500 text-white text-[9px] font-black uppercase rounded"
            >
              Save
            </button>
            <button
              onClick={() => setEditingScoreId(null)}
              className="px-1.5 py-0.5 bg-neutral-800 hover:bg-neutral-750 text-neutral-400 text-[9px] uppercase rounded"
            >
              Cancel
            </button>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {/* Expander alignment placeholder spacing */}
              <span className="w-4 h-4 shrink-0 block" />

              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3.5 h-3.5 text-emerald-400 shrink-0">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 9l10.5-3m0 0L22.5 9M19.5 6v12a3 3 0 11-6-0V9a3 3 0 016-0zm-12 12a3 3 0 11-6 0V6a3 3 0 016 0v12z" />
              </svg>
              <div className="flex flex-col min-w-0">
                <span className="text-xs font-semibold text-neutral-300 truncate leading-tight">
                  {score.title}
                </span>
                {(score.instrument || score.author) && (
                  <span className="text-[9px] text-neutral-500 truncate leading-none mt-0.5">
                    {score.instrument || "Piano"} • {score.author || "Unknown"}
                  </span>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 opacity-0 group-hover/item:opacity-100 transition-opacity">
              <button
                onClick={() => {
                  setEditingScoreId(score.id);
                  setEditingScoreTitle(score.title);
                }}
                className="p-0.5 rounded hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                title="Rename File"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                </svg>
              </button>
              <button
                onClick={() => {
                  if (confirm("Are you sure you want to delete this file?")) {
                    handleDeleteScore(score.id);
                  }
                }}
                className="p-0.5 rounded hover:bg-rose-950/30 text-neutral-400 hover:text-rose-400"
                title="Delete File"
              >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-3 h-3">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  const currentFolders = folders.filter(f => f.folder_parent === currentFolderId);
  const currentScores = scores.filter(s => s.folder_id === currentFolderId);

  return (
    <div className="flex-1 w-full max-w-5xl mx-auto px-6 py-12 flex flex-col gap-8 min-h-0">
      {/* Title / Heading Section */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-400">
          Digital Music Desk
        </span>
        <h1 className="text-3xl font-black tracking-tight text-neutral-100 sm:text-4xl">
          Upload your score or tab here
        </h1>
        <p className="text-sm text-neutral-400 max-w-2xl">
          Bring your sheet music, charts, or tabs into your digital workspace. 
          Upload a PDF, XML, MusicXML, or MXL file to process and convert it directly to EasyScore.
        </p>
      </div>

      {/* Main Top Grid containing Upload Left & Destination Right */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        {/* Left Section: Upload Drop Zone */}
        <div className="relative flex flex-col h-full justify-between">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={triggerBrowse}
            className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-8 transition-all duration-300 h-full min-h-[320px] text-center select-none ${
              loading
                ? "border-indigo-500/30 bg-neutral-900/10 cursor-not-allowed"
                : isDragging
                ? "border-indigo-500 bg-indigo-500/10 shadow-[0_0_24px_rgba(99,102,241,0.15)] scale-[1.01] cursor-pointer"
                : file
                ? "border-emerald-500/50 bg-emerald-950/5 hover:bg-emerald-950/10 cursor-pointer"
                : "border-neutral-800 bg-neutral-900/10 hover:border-neutral-700 hover:bg-neutral-900/20 cursor-pointer"
            }`}
          >
            {/* File Input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.xml,.musicxml,.mxl"
              onChange={onFileSelect}
              className="hidden"
              disabled={loading}
            />

            <div className="flex flex-col items-center gap-4 max-w-md">
              {/* Conditional Display of Icon based on status */}
              {loading ? (
                <div className="relative w-16 h-16 flex items-center justify-center">
                  <div className="absolute inset-0 rounded-full border-2 border-neutral-800"></div>
                  <div className="absolute inset-0 rounded-full border-t-2 border-indigo-400 animate-spin"></div>
                  <span className="text-[10px] font-bold text-indigo-400">{progress}%</span>
                </div>
              ) : file ? (
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)]">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.125 2.25h-4.5c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125v-9M10.125 2.25k"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 8.25h-5.25a2.25 2.25 0 0 0-2.25 2.25v5.25m-6-3h3m-3 3h6m-6 3h6M13.5 2.25H15a2.25 2.25 0 0 1 2.25 2.25v3.375c0 .621.504 1.125 1.125 1.125h3.375M9 11.25h1.5m1.5 0h1.5m-3 2.25h3m-3 2.25h3"
                    />
                  </svg>
                </div>
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400 group-hover:text-indigo-400 group-hover:border-indigo-500/30 group-hover:shadow-[0_0_15px_rgba(99,102,241,0.05)] transition-all duration-300">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    strokeWidth={1.5}
                    stroke="currentColor"
                    className="w-8 h-8 transform group-hover:scale-110 transition-transform duration-300"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75z"
                    />
                  </svg>
                </div>
              )}

              <div className="flex flex-col gap-1">
                <p className="text-sm font-semibold text-neutral-200">
                  {loading ? (
                    currentTask
                  ) : file ? (
                    <span className="text-emerald-400">{file.name}</span>
                  ) : (
                    <span>
                      Drag & drop your file, or{" "}
                      <span className="text-indigo-400 group-hover:text-indigo-300 underline decoration-indigo-400/30 underline-offset-4">
                        browse
                      </span>
                    </span>
                  )}
                </p>
                <p className="text-xs text-neutral-500">
                  {loading ? (
                    "Initiating remote conversion pipeline..."
                  ) : file ? (
                    `File loaded successfully • ${(file.size / (1024 * 1024)).toFixed(2)} MB`
                  ) : (
                    "Supported formats: PDF, XML, MusicXML, MXL. Max size: 50MB"
                  )}
                </p>
              </div>

              {/* Change / Reset Trigger */}
              {!loading && file && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    resetUpload();
                  }}
                  className="mt-2 px-4 py-1.5 rounded-lg border border-neutral-800 text-xs font-semibold text-neutral-400 hover:text-neutral-200 hover:border-neutral-700 hover:bg-neutral-900 transition-all duration-200"
                >
                  Choose Another File
                </button>
              )}
            </div>
          </div>

          {/* Error Banner */}
          {error && !job && (
            <div className="mt-4 p-4 rounded-xl border border-rose-950/40 bg-rose-950/10 text-rose-300 text-sm flex items-center justify-between">
              <div className="flex items-center gap-3">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="currentColor"
                  className="w-5 h-5 text-rose-400 flex-shrink-0"
                >
                  <path
                    fillRule="evenodd"
                    d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.401 3.003zM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z"
                    clipRule="evenodd"
                  />
                </svg>
                <span>{error}</span>
              </div>
              <button
                onClick={resetUpload}
                className="text-rose-400 hover:text-rose-300 font-semibold text-xs uppercase tracking-wider"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Right Section: Destination Storage / Filespace */}
        <div className="flex flex-col bg-neutral-900/30 border border-neutral-800 rounded-2xl p-6 min-h-[340px] shadow-lg h-full justify-between">
          <div className="flex flex-col gap-1.5 mb-3">
            <h2 className="text-sm font-bold text-neutral-300 flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 text-indigo-400 animate-pulse">
                <path fillRule="evenodd" d="M10 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm.75 4.75a.75.75 0 0 0-1.5 0v5.25a.75.75 0 0 0 .15.45l2.25 3a.75.75 0 1 0 1.2-0.9l-2.1-2.8V6.75z" clipRule="evenodd" />
              </svg>
              Destination Storage
            </h2>
            <p className="text-xs text-neutral-400">
              This is where you can manage and organize your music in Notestream.
            </p>
          </div>

          {/* Directory Explorer Header */}
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-neutral-850">
            {/* Path Breadcrumbs */}
            <div className="flex items-center gap-1 text-xs text-neutral-400 overflow-x-auto py-1 scrollbar-none flex-1 mr-2 select-none">
              <button
                onClick={() => setCurrentFolderId(null)}
                onDragOver={(e) => handleItemDragOver(e, "root")}
                onDragLeave={handleItemDragLeave}
                onDrop={(e) => handleItemDrop(e, null)}
                className={`hover:text-indigo-400 transition-colors font-semibold px-1 rounded ${
                  dragOverFolderId === "root"
                    ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50"
                    : ""
                }`}
              >
                Root
              </button>
              {getBreadcrumbs().map((crumb) => {
                const isDragOverThisCrumb = dragOverFolderId === crumb.id;
                return (
                  <React.Fragment key={crumb.id}>
                    <span className="text-neutral-600">/</span>
                    <button
                      onClick={() => setCurrentFolderId(crumb.id)}
                      onDragOver={(e) => handleItemDragOver(e, crumb.id)}
                      onDragLeave={handleItemDragLeave}
                      onDrop={(e) => handleItemDrop(e, crumb.id)}
                      className={`hover:text-indigo-400 transition-colors max-w-[80px] truncate font-semibold px-1 rounded ${
                        isDragOverThisCrumb
                          ? "bg-indigo-500/20 text-indigo-300 ring-1 ring-indigo-500/50"
                          : ""
                      }`}
                    >
                      {crumb.folder_name}
                    </button>
                  </React.Fragment>
                );
              })}
            </div>

            {/* + Folder Button */}
            <button
              onClick={() => setShowNewFolderInput(true)}
              className="flex items-center gap-1.5 px-3 py-1 rounded bg-neutral-800 hover:bg-neutral-750 border border-neutral-700 text-[10px] font-bold text-neutral-300 hover:text-white uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 animate-fade-in"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-400">
                <path d="M3.75 3A1.75 1.75 0 0 0 2 4.75v10.5c0 .966.784 1.75 1.75 1.75h12.5A1.75 1.75 0 0 0 18 15.25v-8.5A1.75 1.75 0 0 0 16.25 5h-4.836l-1.44-2.16A1.75 1.75 0 0 0 8.49 2H3.75z" />
              </svg>
              + Folder
            </button>
          </div>

          {/* Inline New Folder Input */}
          {showNewFolderInput && (
            <div className="flex items-center gap-2 mb-3 bg-neutral-950/60 p-2 rounded-xl border border-neutral-850 animate-fade-in">
              <input
                type="text"
                placeholder="Folder name..."
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                className="bg-neutral-900 border border-neutral-800 focus:border-indigo-500 rounded px-2.5 py-1 text-xs text-neutral-200 outline-none flex-1"
                autoFocus
              />
              <button
                onClick={() => {
                  if (newFolderName.trim()) {
                    handleAddFolder(newFolderName.trim());
                    setNewFolderName("");
                    setShowNewFolderInput(false);
                  }
                }}
                className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-[10px] uppercase rounded"
              >
                Create
              </button>
              <button
                onClick={() => {
                  setShowNewFolderInput(false);
                  setNewFolderName("");
                }}
                className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-[10px] uppercase rounded"
              >
                Cancel
              </button>
            </div>
          )}

          {/* Main Filespace List (Recursive Folder Tree Explorer) */}
          <div className="flex-1 overflow-y-auto max-h-[300px] min-h-[220px] flex flex-col gap-1 pr-1 scrollbar-thin scrollbar-thumb-neutral-850">
            {/* Go Up Directory */}
            {currentFolderId !== null && (
              <div
                onClick={() => {
                  const parentFolder = folders.find(f => f.id === currentFolderId);
                  setCurrentFolderId(parentFolder ? parentFolder.folder_parent : null);
                }}
                onDragOver={(e) => handleItemDragOver(e, "up")}
                onDragLeave={handleItemDragLeave}
                onDrop={(e) => {
                  const parentFolder = folders.find(f => f.id === currentFolderId);
                  handleItemDrop(e, parentFolder ? parentFolder.folder_parent : null);
                }}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-neutral-950/20 hover:bg-neutral-950/50 border border-transparent hover:border-neutral-850 cursor-pointer text-xs text-neutral-400 hover:text-neutral-200 transition-all select-none ${
                  dragOverFolderId === "up"
                    ? "border-indigo-500 bg-indigo-500/10 text-indigo-300 shadow-[0_0_12px_rgba(99,102,241,0.1)]"
                    : ""
                }`}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5 text-indigo-400 shrink-0">
                  <path fillRule="evenodd" d="M10 17a.75.75 0 0 1-.75-.75V5.612L5.29 9.77a.75.75 0 0 1-1.08-1.04l5.25-5.5a.75.75 0 0 1 1.08 0l5.25 5.5a.75.75 0 1 1-1.08 1.04l-3.96-4.158V16.25A.75.75 0 0 1 10 17z" clipRule="evenodd" />
                </svg>
                <span className="font-bold">.. (Go Up)</span>
              </div>
            )}

            {/* Empty Folder View */}
            {currentFolders.length === 0 && currentScores.length === 0 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-neutral-950/10 border border-dashed border-neutral-850 rounded-xl h-full select-none">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6 text-neutral-700 mb-1">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 13.5h3.86a2.25 2.25 0 0 1 2.008 1.24l.885 1.77a2.25 2.25 0 0 0 2.007 1.24h1.98a2.25 2.25 0 0 0 2.007-1.24l.885-1.77a2.25 2.25 0 0 1 2.007-1.24h3.86m-18 0h18" />
                </svg>
                <span className="text-[10px] uppercase font-extrabold text-neutral-500 tracking-widest">Empty Directory</span>
                <span className="text-[9px] text-neutral-600 mt-0.5">Files uploaded will be saved here</span>
              </div>
            )}

            {/* Folders List rendered with recursive tree selective expansion */}
            {currentFolders.map((folder) => renderFolderTreeItem(folder, 0))}

            {/* Scores List rendered at direct folder level */}
            {currentScores.map((score) => renderScoreTreeItem(score, 0))}
          </div>

          {/* Active Target Indicator */}
          <div className="mt-4 pt-3 border-t border-neutral-850 flex items-center justify-between text-[11px] text-neutral-500 font-semibold select-none font-geist-mono">
            <span>Upload Target Destination:</span>
            <span className="font-extrabold text-indigo-400 truncate max-w-[180px] bg-indigo-950/20 px-2 py-1 rounded border border-indigo-500/10">
              {currentFolderId === null
                ? "Root Folder"
                : `${folders.find(f => f.id === currentFolderId)?.folder_name || "Selected folder"}`
              }
            </span>
          </div>
        </div>
      </div>

      {/* Conversion Progress Area - Bottom Half */}
      {(loading || job) && (
        <div className="flex flex-col gap-6 mt-4 p-6 bg-neutral-900 border border-neutral-800 rounded-2xl shadow-lg">
          <div className="flex flex-col gap-2 border-b border-neutral-800 pb-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-neutral-100 flex items-center gap-2">
                <span>Conversion Job Status</span>
                {job && (
                  <span className={`text-xs px-2.5 py-1 rounded-full font-semibold border ${
                    job.status === "completed"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 shadow-[0_0_10px_rgba(16,185,129,0.1)]"
                      : job.status === "failed"
                      ? "bg-rose-500/10 text-rose-400 border-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.1)]"
                      : job.status === "processing"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse"
                      : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                  }`}>
                    {job.status.toUpperCase()}
                  </span>
                )}
              </h2>
              
              <button
                onClick={resetUpload}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors cursor-pointer"
              >
                Clear Progress
              </button>
            </div>
            <p className="text-xs text-neutral-400">
              Track the server-side progress of your score conversion below.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column: Metrics & Info */}
            <div className="flex flex-col gap-4">
              {job?.jobId && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Job ID</span>
                  <div className="flex items-center gap-2">
                    <code className="text-xs font-mono bg-neutral-950 px-3 py-2 rounded-lg border border-neutral-800 text-neutral-300 select-all w-full truncate block">
                      {job.jobId}
                    </code>
                  </div>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Current Stage</span>
                <span className="text-sm font-semibold text-neutral-200 bg-neutral-950/40 px-3 py-2 rounded-lg border border-neutral-800/60 block">
                  {job?.stage || currentTask || "Initiating..."}
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Status Message</span>
                <span className="text-sm text-neutral-300 bg-neutral-950/40 px-3 py-2 rounded-lg border border-neutral-800/60 block min-h-[40px]">
                  {job?.message || "Waiting for server response..."}
                </span>
              </div>
            </div>

            {/* Right Column: Visual Progress Bar & Status Blocks */}
            <div className="flex flex-col gap-4 justify-between">
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Overall Progress</span>
                  <span className="text-lg font-black text-indigo-400">{progress}%</span>
                </div>
                
                {/* Visual Progress Bar Wrapper */}
                <div className="w-full h-3 bg-neutral-950 rounded-full border border-neutral-800 overflow-hidden p-[2px]">
                  <div
                    style={{ width: `${progress}%` }}
                    className={`h-full rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(99,102,241,0.4)] ${
                      job?.status === "completed"
                        ? "bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
                        : job?.status === "failed"
                        ? "bg-gradient-to-r from-rose-500 to-pink-500 shadow-[0_0_8px_rgba(244,63,94,0.4)]"
                        : "bg-gradient-to-r from-indigo-500 to-purple-500"
                    }`}
                  />
                </div>
              </div>

              {/* Success Result Path or Failure Error */}
              {job?.status === "completed" && job.resultPath && (
                <div className="p-4 rounded-xl border border-emerald-950/50 bg-emerald-950/10 text-emerald-300 flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.082l3.74-5.24z" clipRule="evenodd" />
                    </svg>
                    Conversion Completed
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-400">Result Location:</span>
                    <code className="text-xs font-mono bg-neutral-950 px-2 py-1 rounded border border-neutral-800 text-neutral-300 select-all block break-all">
                      {job.resultPath}
                    </code>
                  </div>
                  <div className="mt-2 pt-2 border-t border-emerald-500/10 flex flex-col gap-1.5">
                    <a
                      href={`${API_URL}/conversions/${job.jobId}/result`}
                      download
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-neutral-950 font-black text-xs uppercase tracking-wider transition-all duration-200 shadow-[0_4px_12px_rgba(16,185,129,0.2)] hover:shadow-[0_4px_20px_rgba(16,185,129,0.3)] hover:-translate-y-0.5"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path fillRule="evenodd" d="M10 3a.75.75 0 01.75.75v6.75h2.25a.75.75 0 11.53 1.28l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 11.53-1.28h2.25V3.75A.75.75 0 0110 3zM3.75 16a.75.75 0 000 1.5h12.5a.75.75 0 000-1.5H3.75z" clipRule="evenodd" />
                      </svg>
                      Download EasyScore JSON
                    </a>
                  </div>
                </div>
              )}

              {job?.status === "failed" && error && (
                <div className="p-4 rounded-xl border border-rose-950/50 bg-rose-950/10 text-rose-300 flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.401 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5z" clipRule="evenodd" />
                    </svg>
                    Conversion Failed
                  </span>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-400">Error Message:</span>
                    <p className="text-xs text-rose-200 font-semibold break-words">
                      {error}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Console Step Log Terminal */}
          {logs.length > 0 && (
            <div className="flex flex-col gap-2 mt-4">
              <span className="text-xs font-bold text-neutral-500 uppercase tracking-wider">Conversion Pipeline Console</span>
              <div className="w-full bg-neutral-950 border border-neutral-800/80 rounded-xl p-4 font-mono text-xs text-neutral-400 h-44 overflow-y-auto flex flex-col gap-1 shadow-inner scrollbar-thin scrollbar-thumb-neutral-800">
                <div className="flex items-center gap-1.5 border-b border-neutral-900 pb-2 mb-2 text-neutral-500 font-semibold select-none">
                  <span className="w-2.5 h-2.5 rounded-full bg-neutral-800"></span>
                  <span>notestream-cli-stream v1.0.0</span>
                </div>
                {logs.map((log, idx) => (
                  <div key={idx} className="flex gap-2 leading-relaxed">
                    <span className="text-indigo-500/80 select-none">[{log.timestamp}]</span>
                    <span className="text-neutral-500 select-none font-bold">[{log.stage.toUpperCase()}]</span>
                    <span className={
                      log.stage === "failed" || log.message.toLowerCase().includes("fail") || log.message.toLowerCase().includes("error")
                        ? "text-rose-400"
                        : log.stage === "completed" || log.message.toLowerCase().includes("completed") || log.message.toLowerCase().includes("success")
                        ? "text-emerald-400 font-semibold"
                        : "text-neutral-300"
                    }>
                      {log.message}
                    </span>
                  </div>
                ))}
                <div ref={terminalEndRef} />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Placeholder / Empty State when no file is uploaded */}
      {!loading && !job && (
        <div className="flex-1 flex flex-col items-center justify-center border border-neutral-900 rounded-2xl p-12 text-center bg-neutral-950/20 min-h-[250px]">
          <div className="max-w-md flex flex-col items-center gap-4">
            <div className="w-12 h-12 rounded-full border border-neutral-800 flex items-center justify-center text-neutral-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={1.5}
                stroke="currentColor"
                className="w-6 h-6"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9z"
                />
              </svg>
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="text-sm font-semibold text-neutral-300">No active score conversion</h3>
              <p className="text-xs text-neutral-500">
                Upload a chart or score using the field above to initialize the remote conversion pipeline.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
