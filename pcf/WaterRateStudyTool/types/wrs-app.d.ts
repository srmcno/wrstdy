// Types for the pre-bundled React application (`npm run build:pcf` at the
// repository root emits WaterRateStudyTool/app/wrs-app.js). The wildcard form
// is used because the file is a build artifact and is not present when the
// TypeScript language server first loads the project.
declare module '*/wrs-app.js' {
  export interface WaterRateStudyFile {
    filename: string;
    mimeType: string;
    base64: string;
    sizeBytes: number;
    kind: string;
    studyId: string | null;
  }

  export interface WaterRateStudyMountOptions {
    /** Current value of the StudiesJson input property. */
    studiesJson?: string;
    /** true renders the full workspace (study list, dashboard); false edits one study. */
    multiStudy?: boolean;
    onStudiesChanged?: (studies: unknown[]) => void;
    onFileReady?: (file: WaterRateStudyFile) => void;
    onAiRequest?: (payload: Record<string, unknown>) => Promise<string>;
  }

  export interface WaterRateStudyInstance {
    /** Push a new StudiesJson value in. Returns false when it matches what the app last emitted. */
    setStudiesJson(json: string): boolean;
    destroy(): void;
  }

  export function mountWaterRateStudy(
    container: HTMLElement,
    options?: WaterRateStudyMountOptions,
  ): WaterRateStudyInstance;

  export function parseStudiesJson(raw: unknown): unknown[];
}
