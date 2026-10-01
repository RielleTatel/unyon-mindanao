"use client";

type PortalIdentity = typeof import("./firebase-auth");
let failedModuleUrl: URL | undefined;
let recoveredIdentity: PortalIdentity | undefined;
let retryAttempt = 0;

export async function loadPortalIdentity(): Promise<PortalIdentity> {
  if (recoveredIdentity) return recoveredIdentity;
  try {
    if (failedModuleUrl && retryAttempt < 3) {
      // Native ESM caches failed fetches. Explicit retries use a bounded, same-origin URL.
      const retryUrl = new URL(failedModuleUrl);
      retryUrl.searchParams.set("identity_retry", String(++retryAttempt));
      recoveredIdentity = await import(/* webpackIgnore: true */ /* @vite-ignore */ retryUrl.href) as PortalIdentity;
      return recoveredIdentity;
    }
    return await import("./firebase-auth");
  } catch (error) {
    if (typeof window !== "undefined" && error instanceof TypeError) {
      const address = error.message.match(/https?:\/\/[^\s"'<>]+/u)?.[0];
      if (address) {
        try {
          const url = new URL(address);
          if (url.origin === window.location.origin && /^\/_next\/static\/chunks\/firebase-auth-[\w-]+\.js$/u.test(url.pathname)) failedModuleUrl = url;
        } catch { /* Keep the original failure when its message has no valid module URL. */ }
      }
    }
    throw error;
  }
}
