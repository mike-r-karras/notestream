"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [isFading, setIsFading] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    // Start fading out after 5 seconds
    const fadeTimer = setTimeout(() => {
      setIsFading(true);
    }, 5000);

    // Completely remove splash screen after the 1-second fade transition
    const removeTimer = setTimeout(() => {
      setShowSplash(false);
    }, 6000);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(removeTimer);
    };
  }, []);

  return (
    <div className="relative flex flex-col flex-1 items-center justify-center min-h-screen bg-neutral-950 text-neutral-200 overflow-hidden font-sans select-none">
      {/* Splash Screen */}
      {showSplash && (
        <div
          className={`fixed inset-0 z-50 flex flex-col items-center justify-center bg-neutral-950 transition-opacity duration-1000 ease-in-out ${
            isFading ? "opacity-0 pointer-events-none" : "opacity-100"
          }`}
        >
          {/* Glowing Background Orbs */}
          <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none">
            <div className="absolute w-[400px] h-[400px] bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full filter blur-[80px] animate-pulse-glow"></div>
            <div className="absolute w-[300px] h-[300px] bg-gradient-to-r from-purple-600 to-pink-600 rounded-full filter blur-[80px] animate-pulse-glow [animation-delay:1.5s]"></div>
          </div>

          {/* Graphic & Title Container */}
          <div className="relative flex flex-col items-center gap-10 z-10">
            {/* Animated Stream Graphic */}
            <div className="w-64 h-32 flex items-center justify-center animate-float">
              <svg
                width="100%"
                height="100%"
                viewBox="0 0 240 120"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]"
              >
                {/* Background Grid Accent */}
                <g opacity="0.1" stroke="currentColor" strokeWidth="0.5">
                  <line x1="0" y1="20" x2="240" y2="20" />
                  <line x1="0" y1="40" x2="240" y2="40" />
                  <line x1="0" y1="60" x2="240" y2="60" />
                  <line x1="0" y1="80" x2="240" y2="80" />
                  <line x1="0" y1="100" x2="240" y2="100" />
                </g>

                {/* Animated Stream Line 1 (Indigo) */}
                <path
                  d="M 10 60 Q 60 10, 120 60 T 230 60"
                  stroke="url(#streamGrad1)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  className="animate-draw"
                />

                {/* Animated Stream Line 2 (Purple) */}
                <path
                  d="M 10 60 Q 60 110, 120 60 T 230 60"
                  stroke="url(#streamGrad2)"
                  strokeWidth="2"
                  strokeLinecap="round"
                  opacity="0.8"
                  className="animate-draw"
                  style={{ animationDelay: "0.5s" }}
                />

                {/* Connecting Node/Stream Dots */}
                <circle cx="65" cy="35" r="4" fill="#818cf8" className="animate-pulse" />
                <circle cx="120" cy="60" r="5" fill="#a78bfa" className="animate-pulse" style={{ animationDelay: "0.8s" }} />
                <circle cx="175" cy="85" r="4" fill="#c084fc" className="animate-pulse" style={{ animationDelay: "0.4s" }} />

                {/* Gradients */}
                <defs>
                  <linearGradient id="streamGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#3b82f6" />
                    <stop offset="50%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#8b5cf6" />
                  </linearGradient>
                  <linearGradient id="streamGrad2" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
                    <stop offset="50%" stopColor="#d946ef" />
                    <stop offset="100%" stopColor="#ec4899" stopOpacity="0.4" />
                  </linearGradient>
                </defs>
              </svg>
            </div>

            {/* Title */}
            <div className="flex flex-col items-center gap-2">
              <h1 className="text-5xl font-black tracking-[0.25em] text-transparent bg-clip-text bg-gradient-to-r from-neutral-100 via-neutral-300 to-neutral-400 drop-shadow-[0_2px_10px_rgba(255,255,255,0.15)] uppercase select-none">
                notestream
              </h1>
              <p className="text-xs uppercase tracking-[0.5em] text-neutral-500 font-medium">
                initializing stream
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Main Landing Page */}
      <main className="flex flex-col items-center justify-center z-10 select-none">
        <h2 className="text-xl font-light tracking-[0.3em] text-neutral-400 hover:text-neutral-100 transition-colors duration-500 ease-out select-none">
          you are here
        </h2>
      </main>
    </div>
  );
}
