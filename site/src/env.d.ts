/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Product origin for the site's calls to action; set at deploy time. */
  readonly PUBLIC_APP_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
