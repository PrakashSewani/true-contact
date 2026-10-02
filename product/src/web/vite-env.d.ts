/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Chrome Web Store listing for the WhatsApp connector; set as a build variable. */
  readonly VITE_EXTENSION_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
