import { registerMessages, text } from "../core/locale";
import { apiDocsMessages } from "../core/messages.ru";
registerMessages(apiDocsMessages);
(function () {
    "use strict";
    var host: any = document.getElementById("swagger-ui");
    if (!host || typeof window.SwaggerUIBundle !== "function")
        return;
    var urls: any = [];
    try {
        urls = JSON.parse(host.getAttribute("data-specs") || "[]");
    }
    catch (_: any) {
        host.textContent = text("features.api-docs.001");
        return;
    }
    var requestedSpec: any = new URLSearchParams(window.location.search).get("spec") || "";
    var selected: any = urls.find(function (entry: any) {
        return String(entry.url || "").replace(/^\/+/, "") === requestedSpec;
    });
    var primaryName: any = selected ? selected.name : (urls.length ? urls[0].name : "");
    window.ui = window.SwaggerUIBundle({
        dom_id: "#swagger-ui",
        urls: urls,
        "urls.primaryName": primaryName,
        deepLinking: true,
        displayRequestDuration: true,
        filter: true,
        validatorUrl: null,
        supportedSubmitMethods: ["get", "head"],
        presets: [window.SwaggerUIBundle.presets.apis, window.SwaggerUIStandalonePreset],
        layout: "StandaloneLayout",
        requestInterceptor: function (request: any) {
            var method: any = String(request.method || "GET").toUpperCase();
            if (method !== "GET" && method !== "HEAD") {
                throw new Error(text("features.api-docs.002"));
            }
            return request;
        }
    });
}());
