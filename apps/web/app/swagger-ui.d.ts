declare module 'swagger-ui-dist' {
  interface SwaggerRequest {
    method?: string;
    [key: string]: unknown;
  }

  interface SwaggerOptions {
    domNode: HTMLElement;
    urls: Array<{ name: string; url: string }>;
    'urls.primaryName'?: string;
    deepLinking?: boolean;
    displayRequestDuration?: boolean;
    filter?: boolean;
    validatorUrl?: string | null;
    supportedSubmitMethods?: string[];
    presets?: unknown[];
    layout?: string;
    requestInterceptor?: (request: SwaggerRequest) => SwaggerRequest;
  }

  interface SwaggerBundle {
    (options: SwaggerOptions): unknown;
    presets: { apis: unknown };
  }

  export const SwaggerUIBundle: SwaggerBundle;
  export const SwaggerUIStandalonePreset: unknown;
}
