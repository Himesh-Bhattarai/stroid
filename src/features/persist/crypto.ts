const DEFAULT_PERSIST_CRYPTO_MARK = typeof Symbol === "function"
    ? Symbol.for("stroid.persist.defaultCrypto")
    : "__stroid_persist_defaultCrypto__";

export const usesDefaultPersistCrypto = (fn: (v: string) => string): boolean =>
    !!(fn as any)?.[DEFAULT_PERSIST_CRYPTO_MARK];

export const isIdentityCrypto = (fn: (v: string) => string): boolean => {
    try {
        const probe = "__stroid_plaintext_probe__";
        return fn(probe) === probe;
    } catch (_) {
        const src = fn.toString().replace(/\s/g, "");
        return src === "v=>v" || src === "(v)=>v" || src === "function(v){returnv;}";
    }
};

export const validateCryptoPair = (
    name: string,
    encrypt: (v: string) => string,
    decrypt: (v: string) => string
): { ok: boolean; reason?: string } => {
    const probe = "__stroid_persist_roundtrip_probe__";
    let encrypted: string;
    try {
        encrypted = encrypt(probe);
    } catch (err) {
        return { ok: false, reason: `persist: encrypt failed for store "${name}" (${(err as { message?: string })?.message ?? err})` };
    }
    if (typeof encrypted !== "string") {
        return { ok: false, reason: `persist: encrypt must return a string for store "${name}".` };
    }
    let decrypted: string;
    try {
        decrypted = decrypt(encrypted);
    } catch (err) {
        return { ok: false, reason: `persist: decrypt failed for store "${name}" (${(err as { message?: string })?.message ?? err})` };
    }
    if (typeof decrypted !== "string") {
        return { ok: false, reason: `persist: decrypt must return a string for store "${name}".` };
    }
    if (decrypted !== probe) {
        return { ok: false, reason: `persist: encrypt/decrypt must round-trip for store "${name}".` };
    }
    return { ok: true };
};
