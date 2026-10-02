/**
 * Chrome Web Store listing for the WhatsApp connector. Set VITE_EXTENSION_URL
 * as a build variable once the listing exists; the fallback is a store search
 * so the link keeps working either way.
 */
export const EXTENSION_STORE_URL =
  import.meta.env.VITE_EXTENSION_URL ?? 'https://chromewebstore.google.com/search/TrueContact';
