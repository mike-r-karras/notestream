/**
 * Utility to hash a password to SHA-256 hex string using browser Web Crypto API.
 */
export async function hashPassword(password: string): Promise<string> {
  if (typeof window === "undefined") {
    return "";
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}
