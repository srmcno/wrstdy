import { IInputs, IOutputs } from './generated/ManifestTypes';
// The React application is pre-bundled by `npm run build:pcf` at the
// repository root (vite.pcf.config.js) into ./app/wrs-app.js — one ES module
// with React 18, the stylesheet, and every dependency inlined. Webpack folds
// it into the single bundle.js the framework loads.
// Types live in ./types/wrs-app.d.ts.
import {
  mountWaterRateStudy,
  WaterRateStudyFile,
  WaterRateStudyInstance,
} from './app/wrs-app.js';

type FilePayload = WaterRateStudyFile;
type MountedApp = WaterRateStudyInstance;

type AiRequest = {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
};

// Height the control falls back to when the framework reports no allocation
// (canvas apps in "auto height" containers pass -1). Eight wizard steps of
// dense tables need room; below this the internal scroll areas become unusable.
const FALLBACK_HEIGHT_PX = 900;
const MIN_HEIGHT_PX = 420;

export class WaterRateStudyTool implements ComponentFramework.StandardControl<IInputs, IOutputs> {
  private container!: HTMLDivElement;
  private notifyOutputChanged!: () => void;
  private app: MountedApp | null = null;

  // Pending outputs. getOutputs() is called by the framework AFTER
  // notifyOutputChanged, so every event queues its values here first.
  private studiesJsonOut = '';
  private changedStudyId = '';
  private studyCount = 0;
  private lastEvent = '';
  private lastEventAt = '';
  private eventClock = 0;
  private aiTimeout: ReturnType<typeof setTimeout> | null = null;
  private fileName = '';
  private fileMimeType = '';
  private fileBase64 = '';
  private fileSizeBytes = 0;
  private aiRequestId = '';
  private aiRequestJson = '';

  // In-flight analysis request, keyed by the correlation id handed to the app.
  private pendingAi: (AiRequest & { id: string }) | null = null;
  private lastAiResponseId = '';

  // Last StudiesJson value seen from the platform, so an unchanged property on
  // an unrelated updateView (a resize, a theme change) doesn't reset the app.
  private lastStudiesJsonIn: string | null = null;
  private lastReadOnly: boolean | null = null;
  private readOnlyObserver: MutationObserver | null = null;
  private disabledBeforeReadOnly = new WeakMap<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement, boolean>();

  public init(
    context: ComponentFramework.Context<IInputs>,
    notifyOutputChanged: () => void,
    _state: ComponentFramework.Dictionary,
    container: HTMLDivElement,
  ): void {
    this.notifyOutputChanged = notifyOutputChanged;
    this.container = container;
    // Ask the framework to call updateView on container resize so the app's
    // own responsive breakpoints (measured against the control, not the
    // window) stay correct when the maker resizes it on the canvas.
    context.mode.trackContainerResize(true);

    const studiesJson = context.parameters.StudiesJson?.raw ?? '';
    this.lastStudiesJsonIn = studiesJson;

    this.app = mountWaterRateStudy(container, {
      studiesJson,
      multiStudy: (context.parameters.Mode?.raw ?? 'single') === 'workspace',
      onStudiesChanged: (studies: unknown[]) => this.emitStudies(studies),
      onFileReady: (file: FilePayload) => this.emitFile(file),
      onAiRequest: (payload: Record<string, unknown>) => this.requestAi(payload),
    });

    this.applySize(context);
    this.applyReadOnly(Boolean(context.parameters.ReadOnly?.raw));
  }

  public updateView(context: ComponentFramework.Context<IInputs>): void {
    this.applySize(context);

    // Studies pushed in from the app (a different record selected, a refresh).
    // `raw` can legitimately be null while the data source is still loading —
    // treat that as "nothing new" rather than as an empty study set, or the
    // user's work is wiped by a transient null. (Framework guidance: "Null
    // values are passed to updateView when data isn't ready.")
    const incoming = context.parameters.StudiesJson?.raw;
    if (typeof incoming === 'string' && incoming !== this.lastStudiesJsonIn) {
      this.lastStudiesJsonIn = incoming;
      this.app?.setStudiesJson(incoming);
    }

    const readOnly = Boolean(context.parameters.ReadOnly?.raw);
    if (readOnly !== this.lastReadOnly) this.applyReadOnly(readOnly);

    this.resolveAiIfReady(context);
  }

  public getOutputs(): IOutputs {
    return {
      StudiesJsonOut: this.studiesJsonOut,
      ChangedStudyId: this.changedStudyId,
      StudyCount: this.studyCount,
      LastEvent: this.lastEvent,
      LastEventAt: this.lastEventAt,
      FileName: this.fileName,
      FileMimeType: this.fileMimeType,
      FileBase64: this.fileBase64,
      FileSizeBytes: this.fileSizeBytes,
      AiRequestId: this.aiRequestId,
      AiRequestJson: this.aiRequestJson,
    };
  }

  public destroy(): void {
    // Reject anything still waiting so the app shows an error rather than a
    // spinner that never stops if the screen is navigated away from.
    this.pendingAi?.reject(new Error('The screen closed before the analysis came back.'));
    this.pendingAi = null;
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    this.readOnlyObserver?.disconnect();
    this.app?.destroy();
    this.app = null;
  }

  // ── Event plumbing ────────────────────────────────────────────────────────

  private emitStudies(studies: unknown[]): void {
    this.studiesJsonOut = JSON.stringify(studies);
    this.studyCount = studies.length;
    this.changedStudyId = String((studies[0] as { id?: unknown })?.id ?? '');
    this.markEvent('save');
  }

  private emitFile(file: FilePayload): void {
    this.fileName = file.filename;
    this.fileMimeType = file.mimeType;
    this.fileBase64 = file.base64;
    this.fileSizeBytes = file.sizeBytes;
    this.changedStudyId = file.studyId ?? this.changedStudyId;
    this.markEvent('file');
  }

  private requestAi(payload: Record<string, unknown>): Promise<string> {
    // One analysis at a time per control. A second request while one is in
    // flight would overwrite the correlation id, and the first reply would
    // then have nowhere to land.
    if (this.pendingAi) {
      return Promise.reject(new Error('An analysis is already running for this study. Wait for it to finish.'));
    }
    const id = `ai-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    this.aiRequestId = id;
    this.aiRequestJson = JSON.stringify({ id, ...payload });
    return new Promise<string>((resolve, reject) => {
      this.pendingAi = { id, resolve, reject };
      this.aiTimeout = setTimeout(() => {
        if (this.pendingAi?.id !== id) return;
        this.pendingAi = null;
        reject(new Error('Analysis timed out after 120 seconds. Check the flow and retry.'));
      }, 120000);
      this.markEvent('ai-request');
    });
  }

  private resolveAiIfReady(context: ComponentFramework.Context<IInputs>): void {
    const responseId = context.parameters.AiResponseId?.raw ?? '';
    if (!responseId || responseId === this.lastAiResponseId) return;
    this.lastAiResponseId = responseId;
    const pending = this.pendingAi;
    // A reply whose id doesn't match the outstanding request is stale (a flow
    // that finished after the user moved on) — ignore it rather than showing
    // one study's analysis on another.
    if (!pending || pending.id !== responseId) return;
    this.pendingAi = null;
    if (this.aiTimeout) clearTimeout(this.aiTimeout);
    this.aiTimeout = null;
    const error = context.parameters.AiResponseError?.raw ?? '';
    if (error) {
      pending.reject(new Error(error));
      return;
    }
    pending.resolve(context.parameters.AiResponseText?.raw ?? '');
  }

  private markEvent(kind: string): void {
    this.lastEvent = kind;
    // A fresh timestamp on every event: canvas OnChange only fires when a
    // property value actually changes, so two saves in a row with identical
    // JSON would otherwise be invisible to the app.
    this.eventClock = Math.max(Date.now(), this.eventClock + 1);
    this.lastEventAt = new Date(this.eventClock).toISOString();
    this.notifyOutputChanged();
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  private applySize(context: ComponentFramework.Context<IInputs>): void {
    const allocatedHeight = Number(context.mode.allocatedHeight);
    const height = Number.isFinite(allocatedHeight) && allocatedHeight > 0
      ? Math.max(MIN_HEIGHT_PX, allocatedHeight)
      : FALLBACK_HEIGHT_PX;
    this.container.style.height = `${height}px`;
    const allocatedWidth = Number(context.mode.allocatedWidth);
    this.container.style.width = Number.isFinite(allocatedWidth) && allocatedWidth > 0
      ? `${allocatedWidth}px`
      : '100%';
  }

  private applyReadOnly(readOnly: boolean): void {
    this.lastReadOnly = readOnly;
    // Keep step navigation and scrolling usable for reviewers. Disable editors
    // and actions, including newly rendered controls after a tab change.
    this.readOnlyObserver?.disconnect();
    this.readOnlyObserver = null;
    const apply = () => {
      this.container.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement | HTMLTextAreaElement>('input, textarea, select, button').forEach(el => {
        const navigation = el.tagName === 'BUTTON' && el.closest('.tabs, .ws-nv, .study-guide, .ws-bar') && !el.classList.contains('b-del');
        if (readOnly && !navigation) {
          if (!this.disabledBeforeReadOnly.has(el)) this.disabledBeforeReadOnly.set(el, el.disabled);
          el.disabled = true;
        } else if (this.disabledBeforeReadOnly.has(el)) {
          el.disabled = this.disabledBeforeReadOnly.get(el) ?? false;
          this.disabledBeforeReadOnly.delete(el);
        }
      });
    };
    apply();
    if (readOnly) {
      this.readOnlyObserver = new MutationObserver(apply);
      this.readOnlyObserver.observe(this.container, { childList: true, subtree: true });
    }
    this.container.setAttribute('data-wrs-readonly', String(readOnly));
  }
}
