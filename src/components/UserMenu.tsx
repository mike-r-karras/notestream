"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth, User } from "../context/AuthContext";
import { hashPassword } from "../utils/crypto";

export function SilhouetteQuestionSVG({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} bg-neutral-900 rounded-full border border-neutral-800 shadow-inner`}
    >
      <circle cx="64" cy="64" r="64" fill="var(--color-neutral-900)" />
      <circle cx="64" cy="48" r="22" fill="var(--color-neutral-600)" />
      <path d="M28 104C28 85 44 74 64 74C84 74 100 85 100 104H28Z" fill="var(--color-neutral-600)" />
      <circle cx="96" cy="96" r="20" fill="var(--color-indigo-600)" stroke="var(--color-neutral-900)" strokeWidth="4" />
      <text
        x="96"
        y="103"
        fontFamily="sans-serif"
        fontSize="22px"
        fontWeight="900"
        fill="white"
        textAnchor="middle"
      >
        ?
      </text>
    </svg>
  );
}

export function SilhouetteSVG({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 128 128"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`${className} bg-neutral-900 rounded-full border border-neutral-800 shadow-inner`}
    >
      <circle cx="64" cy="64" r="64" fill="var(--color-neutral-900)" />
      <circle cx="64" cy="48" r="22" fill="var(--color-indigo-600)" />
      <path d="M28 104C28 85 44 74 64 74C84 74 100 85 100 104H28Z" fill="var(--color-indigo-600)" />
    </svg>
  );
}

export default function UserMenu() {
  const { user, login, logout, createProfile, updateUserAvatar } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [modalType, setModalType] = useState<"login" | "signup" | "edit" | null>(null);
  const [mounted, setMounted] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Set mounted on client side to enable portal
  useEffect(() => {
    setMounted(true);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8787";
  const avatarUrl = user && user.hasAvatar
    ? `${API_BASE_URL}${user.avatarUrl}?m=${encodeURIComponent(user.modifiedDatetime || "")}`
    : null;

  return (
    <div className="relative select-none" ref={dropdownRef}>
      {/* Avatar Indicator Button */}
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="flex items-center justify-center rounded-full hover:ring-2 hover:ring-indigo-500 hover:ring-offset-2 hover:ring-offset-neutral-950 transition-all cursor-pointer focus:outline-none"
      >
        {user ? (
          avatarUrl ? (
            <img
              src={avatarUrl}
              alt={user.username}
              className="w-10 h-10 rounded-full object-cover border border-neutral-800 bg-neutral-900"
            />
          ) : (
            <SilhouetteSVG className="w-10 h-10" />
          )
        ) : (
          <SilhouetteQuestionSVG className="w-10 h-10" />
        )}
      </button>

      {/* Dropdown Menu */}
      {dropdownOpen && (
        <div className="absolute right-0 mt-2 w-56 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl z-50 overflow-hidden animate-fade-in">
          {user ? (
            <div>
              {/* User summary */}
              <div className="px-4 py-3 border-b border-neutral-800 bg-neutral-950/40">
                <p className="text-sm font-semibold text-neutral-200 truncate">{user.username}</p>
                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              </div>
              <div className="p-1.5 flex flex-col gap-1">
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    setModalType("edit");
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
                >
                  Edit Profile
                </button>
                <button
                  onClick={() => {
                    setDropdownOpen(false);
                    logout().catch((err) => console.error("Logout failed", err));
                  }}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-950/20 rounded-lg transition-colors cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            </div>
          ) : (
            <div className="p-1.5 flex flex-col gap-1">
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setModalType("login");
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-neutral-300 hover:text-neutral-100 hover:bg-neutral-800 rounded-lg transition-colors cursor-pointer"
              >
                Login
              </button>
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  setModalType("signup");
                }}
                className="w-full text-left px-3 py-2 text-xs font-semibold text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950/20 rounded-lg transition-colors cursor-pointer"
              >
                Create Profile
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals Container */}
      {mounted && modalType && createPortal(
        <>
          {modalType === "login" && (
            <LoginModal onClose={() => setModalType(null)} onLogin={login} />
          )}
          {modalType === "signup" && (
            <SignupModal onClose={() => setModalType(null)} onSignup={createProfile} />
          )}
          {modalType === "edit" && user && (
            <EditProfileModal
              onClose={() => setModalType(null)}
              user={user}
              updateUserAvatar={updateUserAvatar}
              avatarUrl={avatarUrl}
            />
          )}
        </>,
        document.body
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Login Modal                                                                */
/* -------------------------------------------------------------------------- */

interface LoginModalProps {
  onClose: () => void;
  onLogin: (usernameOrEmail: string, passwordHex: string) => Promise<User>;
}

function LoginModal({ onClose, onLogin }: LoginModalProps) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier || !password) {
      setError("Please fill in all fields");
      return;
    }
    setSubmitting(true);
    try {
      const hashed = await hashPassword(password);
      await onLogin(identifier, hashed);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-in my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
        >
          ✕
        </button>
        <h3 className="text-lg font-bold text-neutral-200 uppercase tracking-widest mb-6">
          Login
        </h3>
        {error && (
          <div className="bg-rose-950/30 border border-rose-800 text-rose-400 text-xs px-3 py-2.5 rounded-lg mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              username or email
            </label>
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. janesmith"
              className="bg-neutral-950 border border-neutral-850 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="bg-neutral-950 border border-neutral-850 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none transition-colors"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs uppercase tracking-widest py-3 rounded-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            {submitting ? "Logging in..." : "Log In"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Create Profile Modal                                                       */
/* -------------------------------------------------------------------------- */

interface SignupModalProps {
  onClose: () => void;
  onSignup: (username: string, email: string, passwordHex: string) => Promise<User>;
}

function SignupModal({ onClose, onSignup }: SignupModalProps) {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username || !email || !password) {
      setError("Please fill in all fields");
      return;
    }
    if (username.length > 100) {
      setError("Username is too long");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setSubmitting(true);
    try {
      const hashed = await hashPassword(password);
      await onSignup(username, email, hashed);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative animate-scale-in my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
        >
          ✕
        </button>
        <h3 className="text-lg font-bold text-neutral-200 uppercase tracking-widest mb-6">
          Create Profile
        </h3>
        {error && (
          <div className="bg-rose-950/30 border border-rose-800 text-rose-400 text-xs px-3 py-2.5 rounded-lg mb-4">
            {error}
          </div>
        )}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="e.g. janesmith"
              className="bg-neutral-950 border border-neutral-850 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. jane@example.com"
              className="bg-neutral-950 border border-neutral-850 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none transition-colors"
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
              password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="•••••••• (min 6 chars)"
              className="bg-neutral-950 border border-neutral-850 focus:border-indigo-500 rounded-lg px-3 py-2 text-sm text-neutral-200 outline-none transition-colors"
              required
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="mt-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold text-xs uppercase tracking-widest py-3 rounded-lg transition-all active:scale-98 cursor-pointer flex items-center justify-center gap-2"
          >
            {submitting ? "Creating..." : "Create Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Edit Profile Modal & Custom 128x128 Cropper / Format Converter             */
/* -------------------------------------------------------------------------- */

interface EditProfileModalProps {
  onClose: () => void;
  user: User;
  updateUserAvatar: (blob: Blob) => Promise<void>;
  avatarUrl: string | null;
}

function EditProfileModal({ onClose, user, updateUserAvatar, avatarUrl }: EditProfileModalProps) {
  const [uploadedImageSrc, setUploadedImageSrc] = useState<string | null>(null);
  const [imageName, setImageName] = useState<string>("");
  const [zoom, setZoom] = useState<number>(1.0);
  const [offsetX, setOffsetX] = useState<number>(0);
  const [offsetY, setOffsetY] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  // Drag states
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0, startOffsetX: 0, startOffsetY: 0 });

  const imageRef = useRef<HTMLImageElement | null>(null);

  // Read upload and convert format natively through browser + HTMLCanvas
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Supports conversion from common formats (webp, png, jpeg, bmp, etc.)
    const reader = new FileReader();
    reader.onload = (event) => {
      setUploadedImageSrc(event.target?.result as string);
      setImageName(file.name);
      // Reset cropping adjustments
      setZoom(1.0);
      setOffsetX(0);
      setOffsetY(0);
    };
    reader.onerror = () => {
      setError("Failed to read image file.");
    };
    reader.readAsDataURL(file);
  };

  // Drag to position the image inside crop box
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!uploadedImageSrc) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      startOffsetX: offsetX,
      startOffsetY: offsetY,
    };
    try {
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      // safe fallback if not supported or fails
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    setOffsetX(dragStartRef.current.startOffsetX + dx);
    setOffsetY(dragStartRef.current.startOffsetY + dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false);
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // safe fallback
    }
  };

  const handleSave = async () => {
    if (!uploadedImageSrc || !imageRef.current) return;
    setSaving(true);
    setError(null);

    try {
      const img = imageRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        throw new Error("Failed to get 2D canvas context.");
      }

      // Draw onto 128x128 canvas with scale and translations
      ctx.fillStyle = "#171717"; // fallback bg
      ctx.fillRect(0, 0, 128, 128);

      ctx.save();
      // Translate to center of 128x128 canvas
      ctx.translate(64, 64);
      // Scale
      ctx.scale(zoom, zoom);
      // Translate to image center + user drag offset
      const drawWidth = img.naturalWidth || img.width;
      const drawHeight = img.naturalHeight || img.height;

      // Fit or center original image
      const scaleToFit = Math.min(100 / drawWidth, 100 / drawHeight);
      const renderWidth = drawWidth * scaleToFit;
      const renderHeight = drawHeight * scaleToFit;

      ctx.translate(-renderWidth / 2 + offsetX, -renderHeight / 2 + offsetY);

      ctx.drawImage(img, 0, 0, renderWidth, renderHeight);
      ctx.restore();

      // Convert to image/png and upload
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setError("Failed to generate cropped image blob.");
          setSaving(false);
          return;
        }

        try {
          await updateUserAvatar(blob);
          setSuccess(true);
          setTimeout(() => {
            setSuccess(false);
            onClose();
          }, 1500);
        } catch (err: unknown) {
          setError(err instanceof Error ? err.message : "Failed to upload cropped avatar.");
        } finally {
          setSaving(false);
        }
      }, "image/png");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error cropping image.");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-neutral-950/80 backdrop-blur-sm p-4">
      <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative animate-scale-in my-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
        >
          ✕
        </button>

        <h3 className="text-lg font-bold text-neutral-200 uppercase tracking-widest mb-2">
          User Profile
        </h3>
        <p className="text-xs text-neutral-500 mb-6 font-medium">
          Logged in as <span className="text-neutral-300">{user.username}</span> ({user.email})
        </p>

        {error && (
          <div className="bg-rose-950/30 border border-rose-800 text-rose-400 text-xs px-3 py-2.5 rounded-lg mb-4">
            {error}
          </div>
        )}
        {success && (
          <div className="bg-emerald-950/30 border border-emerald-800 text-emerald-400 text-xs px-3 py-2.5 rounded-lg mb-4 animate-pulse">
            ✓ Avatar updated successfully!
          </div>
        )}

        <div className="flex flex-col gap-6">
          {/* Avatar Area */}
          <div className="flex flex-col md:flex-row items-center gap-6">
            <div className="flex flex-col items-center gap-2">
              <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
                Current Avatar
              </span>
              <div className="w-[128px] h-[128px] rounded-full border-2 border-neutral-800 bg-neutral-950 overflow-hidden flex items-center justify-center relative shadow-lg">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={user.username}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <SilhouetteSVG className="w-[128px] h-[128px] border-0" />
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col gap-3 w-full">
              <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500">
                Upload New Avatar (Any format)
              </span>
              <label className="flex flex-col items-center justify-center w-full h-24 border border-dashed border-neutral-800 hover:border-indigo-500 bg-neutral-950 hover:bg-neutral-950/60 transition-all rounded-xl cursor-pointer">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <svg
                    className="w-8 h-8 text-neutral-500 mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="1.5"
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <p className="text-xs text-neutral-400 font-semibold tracking-wide">
                    {imageName ? imageName : "Click to select image file"}
                  </p>
                </div>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Interactive Crop & Resize Panel */}
          {uploadedImageSrc && (
            <div className="border border-neutral-800 bg-neutral-950 rounded-xl p-4 flex flex-col gap-4">
              <div className="flex justify-between items-center pb-2 border-b border-neutral-900">
                <span className="text-[10px] uppercase font-bold tracking-widest text-indigo-400">
                  Basic Crop &amp; Resize Tool
                </span>
                <span className="text-[9px] text-neutral-500 uppercase font-semibold">
                  Outputs 128x128 PNG
                </span>
              </div>

              {/* Crop Canvas/Viewport Area */}
              <div className="flex items-center justify-center p-2 bg-neutral-900 rounded-lg">
                <div className="relative w-48 h-48 bg-neutral-950 border border-neutral-800 overflow-hidden flex items-center justify-center select-none">
                  {/* Image being cropped */}
                  <img
                    ref={imageRef}
                    src={uploadedImageSrc}
                    alt="To Crop"
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    style={{
                      transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
                      transition: isDragging ? "none" : "transform 0.15s ease-out",
                      maxWidth: "100px", // base render size to control initial scaling
                      maxHeight: "100px",
                    }}
                    className="cursor-grab active:cursor-grabbing select-none pointer-events-auto"
                    draggable="false"
                  />

                  {/* Circular overlay representing the 128x128 crop boundary */}
                  <div className="absolute inset-0 pointer-events-none border-[36px] border-neutral-950/80 flex items-center justify-center">
                    <div className="w-28 h-28 rounded-full border border-dashed border-indigo-500/80 shadow-[0_0_0_9999px_rgba(10,10,10,0.5)]"></div>
                  </div>
                  <span className="absolute bottom-1 right-2 text-[8px] text-neutral-500 font-bold uppercase select-none pointer-events-none">
                    drag to pan
                  </span>
                </div>
              </div>

              {/* Controls */}
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-4">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-neutral-500 min-w-[50px]">
                    Zoom: {zoom.toFixed(1)}x
                  </span>
                  <input
                    type="range"
                    min="0.2"
                    max="4.0"
                    step="0.1"
                    value={zoom}
                    onChange={(e) => setZoom(parseFloat(e.target.value))}
                    className="flex-1 accent-indigo-600 h-1 bg-neutral-800 rounded-lg appearance-none cursor-pointer"
                  />
                </div>
                <div className="flex gap-4 justify-end">
                  <button
                    onClick={() => {
                      setOffsetX(0);
                      setOffsetY(0);
                      setZoom(1.0);
                    }}
                    className="px-3 py-1 bg-neutral-850 hover:bg-neutral-800 rounded text-[10px] font-bold text-neutral-400 uppercase tracking-widest cursor-pointer active:scale-95 transition-all"
                  >
                    Reset Crop
                  </button>
                  <button
                    onClick={() => {
                      handleSave().catch((err) => console.error("Save avatar failed", err));
                    }}
                    disabled={saving}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-[10px] font-bold text-white uppercase tracking-widest cursor-pointer active:scale-95 transition-all"
                  >
                    {saving ? "Saving..." : "Apply & Upload"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
