package site

import (
	"bytes"
	"html/template"
)

type ScriptAsset struct {
	URL    string
	Module bool
}

type WorkspaceView struct {
	Lang           string
	HTMLAttributes template.HTMLAttr
	Title          string
	Favicon        string
	AppearanceJS   string
	Styles         []string
	Scripts        []ScriptAsset
	Bootstrap      template.JS
	Header         template.HTML
	ProjectTitle   string
	SpecsJSON      string
	Body           template.HTML
}

var workspaceShell = template.Must(template.New("workspace-shell").Parse(`<!doctype html>
<html lang="{{.Lang}}"{{.HTMLAttributes}}>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>{{.Title}}</title>
  <link rel="icon" href="{{.Favicon}}">
  {{if .AppearanceJS}}<script src="{{.AppearanceJS}}"></script>{{end}}
  {{range .Styles}}<link rel="stylesheet" href="{{.}}">{{end}}
  <script id="toudocu-page" type="application/json">{{.Bootstrap}}</script>
  {{range .Scripts}}<script {{if .Module}}type="module"{{else}}defer{{end}} src="{{.URL}}"></script>{{end}}
</head>
{{.Body}}
</html>`))

var editorBody = template.Must(template.New("editor-body").Parse(`<body class="workspace-body editor-body">
<a class="editor-skip" href="#editor-workspace">Перейти к редактору</a>
<div class="editor-shell">
  {{.Header}}
  <section class="workspace-context editor-context" aria-label="Действия редактора">
    <div class="editor-path"><button type="button" data-tree-toggle aria-label="Открыть дерево файлов"><span aria-hidden="true">☰</span><span>Файлы</span></button><span data-current-path>Выберите документ</span><span class="dirty-mark" data-dirty-state hidden>Изменён</span></div>
    <div class="editor-actions"><a data-raw-link href="#" target="_blank" rel="noopener" hidden>Исходник</a><button type="button" data-create-open>Создать</button><button class="primary" type="button" data-save disabled>Сохранить</button></div>
  </section>
  <div class="editor-layout">
    <aside class="editor-tree" data-tree><div class="tree-heading"><strong>Документы</strong><button type="button" data-tree-close aria-label="Закрыть дерево">Закрыть</button></div><label class="tree-search"><span>Фильтр</span><input type="search" data-file-filter placeholder="Путь или название"></label><nav aria-label="Исходные файлы" data-file-tree></nav></aside>
    <main id="editor-workspace" class="editor-workspace">
      <div class="editor-notice" data-conflict hidden role="alert"><strong>Файл изменён снаружи.</strong><span data-conflict-message>Ваш текст сохранён в редакторе. Сравните версии или подтвердите перезапись.</span><button type="button" data-conflict-load>Загрузить внешнюю</button><button type="button" data-conflict-overwrite>Перезаписать</button><button type="button" data-conflict-download hidden>Скачать текст</button></div>
      <div class="editor-tabs" role="tablist" aria-label="Режим просмотра"><button role="tab" aria-selected="true" data-view="editor">Редактор</button><button role="tab" aria-selected="false" data-view="preview">Preview</button><button role="tab" aria-selected="false" data-view="split">Разделённый экран</button></div>
      <div class="editor-stage" data-stage="editor"><section class="source-pane" aria-label="Редактор исходного текста"><div data-editor-host></div><textarea data-editor-fallback spellcheck="false" aria-label="Содержимое документа"></textarea></section><section class="preview-pane" aria-label="Preview" data-preview><div class="preview-empty" data-ui-state="empty">Preview доступен для Markdown.</div></section></div>
      <section class="diagnostics" aria-labelledby="diagnostics-title"><div class="diagnostics-heading"><strong id="diagnostics-title">Diagnostics</strong><span data-diagnostic-count>0</span></div><ol data-diagnostics></ol></section>
    </main>
  </div>
</div>
<dialog data-create-dialog><form method="dialog" data-create-form><header><h2>Создать документ</h2><button value="cancel" aria-label="Закрыть">Закрыть</button></header><label>Шаблон<select data-template-select></select></label><label>Язык<select data-template-language></select></label><div data-template-fields></div><p class="form-error" data-create-error role="alert"></p><footer><button value="cancel">Отмена</button><button class="primary" type="submit" value="default">Создать</button></footer></form></dialog>
<div class="editor-toast" data-toast role="status" aria-live="polite"></div>
</body>`))

var changesBody = template.Must(template.New("changes-body").Parse(`<body class="workspace-body changes-body">
<a class="skip-link" href="#changes-main">Перейти к изменениям</a>
{{.Header}}
<main id="changes-main" class="changes-workspace">
  <section class="changes-overview" aria-labelledby="changes-title"><h1 id="changes-title">Изменения</h1><details class="changes-range-details" data-range-details><summary data-range-summary>HEAD → working tree</summary><div class="changes-range"><p data-range-meta>Подготовка Git-состояния…</p><label>Base<input type="text" value="HEAD" data-base spellcheck="false"></label><label>Branch base<input type="text" data-branch-base placeholder="main" spellcheck="false"></label><label>Target<select data-target><option value="working-tree">working tree</option><option value="index">index</option><option value="HEAD">HEAD</option><option value="revision">Git revision…</option></select></label><label data-target-revision-wrap hidden>Target revision<input type="text" data-target-revision spellcheck="false" placeholder="abc1234"></label><button type="button" class="changes-button" data-apply-range>Применить</button></div></details><p class="changes-summary" data-summary>Подготовка изменений…</p><div class="changes-review-actions"><button type="button" class="changes-button secondary" data-mobile-files aria-expanded="false">Файлы</button><button type="button" class="changes-button secondary" data-discussions-toggle aria-expanded="false">Обсуждения · <span data-open-discussion-count>0</span></button></div></section>
  <div class="changes-notice" data-stale hidden role="status">Рабочая директория изменилась. Отчёт обновляется.</div>
  <div class="changes-notice" data-open-file-stale hidden role="alert"><strong>Открытый файл изменился снаружи.</strong> Текущий просмотр сохранён. <button type="button" class="changes-button secondary" data-refresh-open-file>Обновить</button></div>
  <div class="changes-split"><aside class="changes-list-panel" data-files-panel aria-label="Файлы" role="navigation"><div class="changes-list-heading"><h2>Файлы</h2><span data-result-count></span><button type="button" data-files-close aria-label="Закрыть список файлов">×</button></div><div class="changes-list-filters"><label class="changes-search"><span>Поиск</span><input type="search" data-search placeholder="Путь или название"></label><label><span>Статус</span><select data-status><option value="">Все</option><option value="added">Добавленные</option><option value="untracked">Untracked</option><option value="modified">Изменённые</option><option value="deleted">Удалённые</option><option value="renamed">Переименованные</option></select></label><label><span>Тип</span><select data-scope><option value="">Все файлы</option><option value="documents">Документы</option><option value="other">Остальные файлы</option></select></label></div><div class="changes-file-list" data-file-list></div><button type="button" class="changes-linked-add" data-linked-file-open>+ Связать файл</button></aside><section class="changes-detail" data-detail aria-live="polite"><div class="changes-empty" data-ui-state="empty"><h2>Изменений нет</h2><p>Измените поиск или фильтры файлов.</p></div></section><aside class="review-panel" data-discussions-panel aria-label="Обсуждения" role="complementary" hidden><header><div><strong>Обсуждения</strong><span data-review-summary></span></div><div class="review-header-actions"><button type="button" data-global-comment>Общий комментарий</button><button type="button" data-discussions-close aria-label="Закрыть обсуждения">×</button></div></header><div class="review-thread-list" data-discussion-list></div><footer><button type="button" class="changes-button" data-send-feedback disabled>Отправить агенту · <span data-unsent-count>0</span></button></footer></aside></div>
</main>
<dialog class="review-composer" data-review-composer><form method="dialog" data-review-form><header><div><strong>Новый комментарий</strong><span data-review-target-summary></span></div><button value="cancel" formnovalidate aria-label="Закрыть">×</button></header><label>Комментарий<textarea data-review-message rows="4" maxlength="65536" required></textarea></label><p class="form-error" data-review-error role="alert"></p><footer><button value="cancel" formnovalidate>Отмена</button><button type="submit" class="changes-button" value="default">Добавить <span class="shortcut-hint">Ctrl/⌘ Enter</span></button></footer></form></dialog>
<dialog class="review-file-picker" data-file-picker><form method="dialog"><header><strong>Связать файл</strong><button value="cancel" aria-label="Закрыть">×</button></header><label>Путь или название<input type="search" data-file-picker-query autocomplete="off"></label><div data-file-picker-results></div></form></dialog>
<div class="changes-toast" data-changes-toast role="status" aria-live="polite"><span data-toast-message></span><button type="button" data-copy-agent-prompt hidden>Копировать фразу</button></div>
</body>`))

var apiDocsBody = template.Must(template.New("api-docs-body").Parse(`<body><div id="swagger-ui" data-specs="{{.SpecsJSON}}"></div></body>`))

func renderWorkspace(view WorkspaceView, body *template.Template) (string, error) {
	var renderedBody bytes.Buffer
	if err := body.Execute(&renderedBody, view); err != nil {
		return "", err
	}
	view.Body = template.HTML(renderedBody.String())
	var output bytes.Buffer
	if err := workspaceShell.Execute(&output, view); err != nil {
		return "", err
	}
	return output.String(), nil
}

func RenderEditor(view WorkspaceView) (string, error)  { return renderWorkspace(view, editorBody) }
func RenderChanges(view WorkspaceView) (string, error) { return renderWorkspace(view, changesBody) }
func RenderAPIDocs(view WorkspaceView) (string, error) { return renderWorkspace(view, apiDocsBody) }
