(function () {
  "use strict";

  var host = document.getElementById("swagger-ui");
  if (!host || typeof window.SwaggerUIBundle !== "function") return;
  var urls = [];
  try {
    urls = JSON.parse(host.getAttribute("data-specs") || "[]");
  } catch (_) {
    host.textContent = "Не удалось прочитать список OpenAPI-контрактов.";
    return;
  }
  var requestedSpec = new URLSearchParams(window.location.search).get("spec") || "";
  var selected = urls.find(function (entry) {
    return String(entry.url || "").replace(/^\/+/, "") === requestedSpec;
  });
  var primaryName = selected ? selected.name : (urls.length ? urls[0].name : "");
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
    requestInterceptor: function (request) {
      var method = String(request.method || "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        throw new Error("API docs разрешает Try it out только для GET и HEAD");
      }
      return request;
    }
  });
}());
