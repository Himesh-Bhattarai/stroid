/**
 * @module features/persist/checksum
 *
 * LAYER: Feature runtime
 * OWNS:  Module-level behavior and exports for features/persist/checksum.
 *
 * Consumers: Internal imports and public API.
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
    const subtle = globalThis.crypto?.subtle;
    if (typeof subtle?.digest === "function") {
        const encoder = typeof TextEncoder !== "undefined" ? new TextEncoder() : null;
        if (!encoder && typeof Buffer === "undefined") {
            throw new Error("sha256 checksum is not supported in this environment");
        }
        const data = encoder
            ? encoder.encode(value)
            : new Uint8Array(Buffer.from(value));
        const digest = await subtle.digest("SHA-256", data);
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
