"use client";

import { useEffect, useState, useRef } from "react";

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

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [job, setJob] = useState<ConversionJob | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTask, setCurrentTask] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Auto-scroll for the terminal/logs area
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearTimeout(pollIntervalRef.current);
      }
    };
  }, []);

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

    if (selectedFile.type !== "application/pdf" && !selectedFile.name.toLowerCase().endsWith(".pdf")) {
      setError("Only PDF files are supported. Please upload a valid PDF file.");
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
        pollJobStatus(initialJob.jobId);
      } else {
        setLoading(false);
        if (initialJob.status === "failed") {
          const finalError = initialJob.error || "Job failed on server.";
          setError(finalError);
          appendLog("failed", finalError);
        } else {
          appendLog("completed", "Conversion completed successfully.");
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

  const pollJobStatus = (jobId: string) => {
    if (pollIntervalRef.current) {
      clearTimeout(pollIntervalRef.current);
    }

    const poll = async () => {
      try {
        const response = await fetch(`${API_URL}/conversions/${jobId}`);
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
          }
        } else {
          // Poll again in 1.5s
          pollIntervalRef.current = setTimeout(poll, 1500);
        }
      } catch (err: unknown) {
        console.error("Error during polling: ", err);
        const errMsg = err instanceof Error ? err.message : "An error occurred while tracking conversion progress.";
        setError(errMsg);
        setLoading(false);
        appendLog("failed", errMsg);
      }
    };

    pollIntervalRef.current = setTimeout(poll, 1500);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

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
          Upload a PDF to process it directly using our fast server-side converters.
        </p>
      </div>

      {/* Main Drag & Drop Zone - Top Half */}
      <div className="relative flex flex-col">
        <div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={triggerBrowse}
          className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 transition-all duration-300 min-h-[260px] text-center select-none ${
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
            accept="application/pdf"
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
              <p className="text-base font-semibold text-neutral-200">
                {loading ? (
                  currentTask
                ) : file ? (
                  <span className="text-emerald-400">{file.name}</span>
                ) : (
                  <span>
                    Drag & drop your PDF file, or{" "}
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
                  "Only PDF score format is supported. Max file size: 50MB"
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
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-neutral-950 border border-neutral-800 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
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
                </div>
              )}

              {job?.status === "failed" && error && (
                <div className="p-4 rounded-xl border border-rose-950/50 bg-rose-950/10 text-rose-300 flex flex-col gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.401 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
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
