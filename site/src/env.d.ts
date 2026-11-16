interface ImportMetaEnv {
  /** Where status.json and history.json live, without a trailing slash. */
  readonly PUBLIC_STATUS_BASE?: string;
  /** Build from site/preview/<name> instead of ../incidents (screenshots only). */
  readonly PREVIEW?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
