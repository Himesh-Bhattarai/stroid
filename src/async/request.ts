/**
 * @module async/request
 *
 * LAYER: Async subsystem
 * OWNS:  Module-level behavior and exports for async/request.
 *
 * Consumers: Internal imports and public API.
 */
import type { FetchOptions } from "./cache.js";

export const buildFetchOptions = (options: FetchOptions): RequestInit => {
    const fetchOpts: RequestInit = {};
    const method = (options.method ?? "GET").toUpperCase();
    const hasBody = options.body !== undefined && options.body !== null;

    if (options.method) {
        fetchOpts.method = method;
    }

    if (options.headers) {
        fetchOpts.headers = options.headers;
    } else if (hasBody || !["GET", "HEAD", "DELETE"].includes(method)) {
        fetchOpts.headers = { "Content-Type": "application/json" };
    }

    if (hasBody) {
        fetchOpts.body = typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body);
    }

    if (options.signal) {
        fetchOpts.signal = options.signal;
    }

    return fetchOpts;
};

export const parseResponseBody = async (
    response: Response,
    responseType: FetchOptions["responseType"]
): Promise<unknown> => {
    const type = responseType ?? "auto";
    if (type === "json") return response.json();
    if (type === "text") return response.text();
    if (type === "arrayBuffer") return response.arrayBuffer();
    if (type === "blob") return response.blob();
    if (type === "formData") return response.formData();

    // auto-detect
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("application/json") || contentType.includes("+json")) {
        return response.json();
    }
    if (contentType.startsWith("text/") || contentType.includes("xml") || contentType.includes("html")) {
        return response.text();
    }
    if (contentType.includes("form-data")) return response.formData();
    return response.arrayBuffer();
};


