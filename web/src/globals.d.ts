import type { PageBootstrap } from "./core/bootstrap";

declare global {
  interface Window {
    DocuDocuPage?: PageBootstrap;
    DocuDocuAppearance?: any;
    DocuDocuCodeMirror?: any;
    DocuDocuInitializeScreenMap?: (scope: ParentNode, signal: AbortSignal) => void;
    DocuDocuInitializePlayableFlow?: (scope: ParentNode, signal: AbortSignal) => void;
    SwaggerUIBundle?: any;
    SwaggerUIStandalonePreset?: any;
    mermaid?: any;
    ui?: any;
  }
}

export {};
