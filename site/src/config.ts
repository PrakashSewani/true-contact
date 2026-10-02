/**
 * Product origin for the site's calls to action. Set PUBLIC_APP_URL at deploy
 * time (see the ship-release skill); the fallback is a placeholder so a
 * forgotten step is visible rather than silently wrong.
 */
export const APP_URL = import.meta.env.PUBLIC_APP_URL ?? 'https://app.truecontact.example';

/**
 * Chrome Web Store listing for the WhatsApp connector. The listing publishes together with the
 * public launch — until then this is unset and the site shows the closed-beta path instead of
 * store links. Set PUBLIC_EXTENSION_URL at deploy time once the listing is live (see the
 * ship-release skill).
 */
export const EXTENSION_URL = import.meta.env.PUBLIC_EXTENSION_URL;
