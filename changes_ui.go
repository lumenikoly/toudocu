package docgent

import (
	"fmt"
	"net/http"
)

func (s *documentationServer) serveChangesUI(w http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		w.Header().Set("Allow", "GET, HEAD")
		http.Error(w, "Метод не поддерживается", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	if request.Method == http.MethodHead {
		return
	}
	projectTitle := "Docgent"
	if s.model != nil && s.model.Project.Title != "" {
		projectTitle = s.model.Project.Title
	}
	_, _ = fmt.Fprintf(w, `<!doctype html><html lang="ru" data-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Изменения — %s</title><link rel="stylesheet" href="/assets/style.css"><link rel="stylesheet" href="/assets/serve.css"><link rel="stylesheet" href="/assets/changes.css"><script src="/assets/mermaid.tiny.js" defer></script><script src="/assets/codemirror.js" defer></script><script src="/assets/changes.js" defer></script></head><body class="changes-body"><a class="skip-link" href="#changes-main">Перейти к изменениям</a><header class="changes-header"><a class="changes-brand" href="/"><span class="brand-mark" aria-hidden="true">DG</span><span>%s</span></a><div class="changes-range" aria-label="Диапазон сравнения"><label>Base<input type="text" value="HEAD" data-base spellcheck="false"></label><label>Base branch<input type="text" data-branch-base placeholder="main" spellcheck="false"></label><span aria-hidden="true">→</span><label>Target<select data-target><option value="working-tree">working tree</option><option value="index">index</option><option value="HEAD">HEAD</option><option value="revision">Git revision…</option></select></label><label data-target-revision-wrap hidden>Target revision<input type="text" data-target-revision spellcheck="false" placeholder="abc1234"></label><button type="button" class="changes-button" data-apply-range>Сравнить</button></div><a class="changes-editor-link" href="/_docgent/editor/">Редактор</a></header><main id="changes-main" class="changes-workspace"><section class="changes-overview" aria-labelledby="changes-title"><div><h1 id="changes-title">Изменения документации</h1><p data-range-summary>Подготовка Git-сравнения…</p></div><dl class="changes-metrics" data-summary aria-label="Сводка изменений"></dl></section><div class="changes-notice" data-stale hidden role="status">Рабочая директория изменилась. Отчёт обновляется.</div><div class="changes-toolbar"><label class="changes-search"><span>Поиск</span><input type="search" data-search placeholder="Путь, ID, route или summary"></label><label><span>Статус</span><select data-status><option value="">Все</option><option value="added">Добавленные</option><option value="untracked">Untracked</option><option value="modified">Изменённые</option><option value="deleted">Удалённые</option><option value="renamed">Переименованные</option></select></label><label><span>Область</span><select data-classification><option value="">Все</option><option value="permanent-documentation">Постоянная документация</option><option value="work-artifact">Рабочие артефакты</option><option value="contract">Контракты</option><option value="asset">Assets</option></select></label><label><span>Git</span><select data-git-state><option value="">Любое состояние</option><option value="staged">Staged</option><option value="unstaged">Unstaged</option><option value="untracked">Untracked</option><option value="committedInBranch">Committed in branch</option></select></label></div><div class="changes-split"><aside class="changes-list-panel" aria-label="Изменённые документы"><div class="changes-list-heading"><h2>Документы</h2><span data-result-count></span></div><div class="changes-file-list" data-file-list></div></aside><section class="changes-detail" data-detail aria-live="polite"><div class="changes-empty"><h2>Выберите документ</h2><p>Откройте файл слева, чтобы изучить source, rendered и semantic diff.</p></div></section></div></main><div class="changes-toast" data-changes-toast role="status" aria-live="polite"></div></body></html>`, escapeHTML(projectTitle), escapeHTML(projectTitle))
}
