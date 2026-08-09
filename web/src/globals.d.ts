import type { PageBootstrap } from "./core/bootstrap";

declare global {
  interface Window {
    ToudocuPage?: PageBootstrap;
    ToudocuAppearance?: any;
    ToudocuCodeMirror?: any;
    ToudocuInitializeScreenMap?: (scope: ParentNode, signal: AbortSignal) => void;
    ToudocuInitializePlayableFlow?: (scope: ParentNode, signal: AbortSignal) => void;
    SwaggerUIBundle?: any;
    SwaggerUIStandalonePreset?: any;
    mermaid?: any;
    ui?: any;
  }
}

export {};
