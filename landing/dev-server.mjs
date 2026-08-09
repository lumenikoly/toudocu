import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const landingRoot = join(repoRoot, "landing");
const documentationRoot = join(repoRoot, "build", "project-docs");
const port = Number.parseInt(process.env.PORT ?? "4173", 10);

const mimeTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
  [".woff2", "font/woff2"],
]);

function resolveRequest(pathname) {
  const documentationRequest = pathname === "/project-docs" || pathname.startsWith("/project-docs/");
  const root = documentationRequest ? documentationRoot : landingRoot;
  let relative = documentationRequest ? pathname.slice("/project-docs".length) : pathname;
  relative = decodeURIComponent(relative).replace(/^\/+/, "");
  const candidate = normalize(join(root, relative || "index.html"));
  if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return null;
  try {
    return statSync(candidate).isDirectory() ? join(candidate, "index.html") : candidate;
  } catch {
    return candidate;
  }
}

if (!Number.isInteger(port) || port < 0 || port > 65535) {
  throw new Error(`Invalid PORT: ${process.env.PORT}`);
}

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname === "/project-docs") {
      response.writeHead(308, { Location: "/project-docs/" }).end();
      return;
    }
    const target = resolveRequest(url.pathname);
    if (!target) {
      response.writeHead(403).end("Forbidden");
      return;
    }
    const stat = statSync(target);
    if (!stat.isFile()) throw new Error("Not a file");
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Length": stat.size,
      "Content-Type": mimeTypes.get(extname(target).toLowerCase()) ?? "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else createReadStream(target).pipe(response);
  } catch {
    response.writeHead(404).end("Not found");
  }
});

server.listen(port, "127.0.0.1", () => {
  const address = server.address();
  const boundPort = typeof address === "object" && address ? address.port : port;
  console.log(`Toudocu landing: http://127.0.0.1:${boundPort}/`);
  console.log(`Russian landing: http://127.0.0.1:${boundPort}/ru/`);
  console.log(`English landing: http://127.0.0.1:${boundPort}/en/`);
  console.log(`Russian documentation: http://127.0.0.1:${boundPort}/project-docs/`);
  console.log(`English documentation: http://127.0.0.1:${boundPort}/project-docs/en/`);
});
