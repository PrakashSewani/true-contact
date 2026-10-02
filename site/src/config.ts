/**
 * Product origin for the site's calls to action. Set PUBLIC_APP_URL at deploy
 * time (see the ship-release skill); the fallback is a placeholder so a
 * forgotten step is visible rather than silently wrong.
 */
export const APP_URL = import.meta.env.PUBLIC_APP_URL ?? 'https://app.truecontact.example';

/**
 * Chrome Web Store listing for the WhatsApp connector. Set PUBLIC_EXTENSION_URL
 * at deploy time once the listing exists; the fallback is a store search so the
 * link keeps working either way.
 */
export const EXTENSION_URL =
  import.meta.env.PUBLIC_EXTENSION_URL ?? 'https://chromewebstore.google.com/search/TrueContact';
