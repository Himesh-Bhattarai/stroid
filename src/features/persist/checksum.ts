/**
 * @fileoverview src\features\persist\checksum.ts
 */
import { hashState } from "../../utils.js";

const toHex = (buffer: ArrayBuffer): string => {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
};

const computeSha256 = async (value: string): Promise<string> => {
    if (typeof globalThis !== "undefined" && (globalThis as any).crypto?.subtle) {
        const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
        const data = encoder ? encoder.encode(value) : new Uint8Array(Buffer.from(value));
        const digest = await (globalThis as any).crypto.subtle.digest("SHA-256", data);
        return toHex(digest);
    }
    try {
        const { createHash } = await import("node:crypto");
        return createHash("sha256").update(value).digest("hex");
    } catch (_) {
        throw new Error("sha256 checksum is not supported in this environment");
    }
};

export const computePersistChecksum = async (
    mode: "hash" | "none" | "sha256",
    payload: string,
    hashFn: (value: unknown) => number = hashState
): Promise<number | string | null> => {
    if (mode === "none") return null;
    if (mode === "sha256") return computeSha256(payload);
    return hashFn(payload);
};

