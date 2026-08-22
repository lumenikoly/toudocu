package toudocu

import (
	"encoding/json"
	"path/filepath"
)

type staticNavigationItem struct {
	ID    string `json:"id,omitempty"`
	Title string `json:"title"`
	Kind  string `json:"kind"`
	URL   string `json:"url"`
}

type staticModuleRelations struct {
	ID       string   `json:"id"`
	UseCases []string `json:"useCases"`
	Screens  []string `json:"screens"`
	Rules    []string `json:"rules"`
}

type staticScreen struct {
	ID       string   `json:"id"`
	Title    string   `json:"title"`
	Route    string   `json:"route,omitempty"`
	Status   string   `json:"status"`
	UseCases []string `json:"useCases"`
	Incoming []string `json:"incomingTransitions"`
	Outgoing []string `json:"outgoingTransitions"`
}

type staticUseCase struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	Status    string   `json:"status"`
	Module    string   `json:"module,omitempty"`
	Flows     []string `json:"flows"`
	Screens   []string `json:"screens"`
	Start     string   `json:"startScreen,omitempty"`
	Terminals []string `json:"terminalScreens"`
}

func writeStaticJSON(output, name string, value any) error {
	content, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return err
	}
	content = append(content, '\n')
	return writeFileEnsured(filepath.Join(output, "data", filepath.FromSlash(name)), content)
}

func writeStaticData(output string, model *Model, search []SearchItem) error {
	if err := writeStaticJSON(output, "search-index.json", search); err != nil {
		return err
	}
	navigation := make([]staticNavigationItem, 0, len(model.Documents)+1)
	for _, document := range model.Documents {
		navigation = append(navigation, staticNavigationItem{ID: stableDocumentID(model, document.SourcePath), Title: document.Title, Kind: pageKindFromDocument(document.Type), URL: document.OutputPath})
	}
	if model.ProjectChangelog != nil {
		navigation = append(navigation, staticNavigationItem{Title: model.ProjectChangelog.Title, Kind: "document", URL: model.ProjectChangelog.OutputPath})
	}
	if err := writeStaticJSON(output, "navigation.json", navigation); err != nil {
		return err
	}
	relations := make([]staticModuleRelations, 0, len(model.Knowledge.Modules))
	for _, module := range model.Knowledge.Modules {
		relations = append(relations, staticModuleRelations{ID: module.ID, UseCases: module.UseCaseIDs, Screens: module.ScreenIDs, Rules: module.BusinessRuleIDs})
	}
	if err := writeStaticJSON(output, "relations.json", relations); err != nil {
		return err
	}
	screens := make([]staticScreen, 0, len(model.Knowledge.Screens))
	for _, screen := range model.Knowledge.Screens {
		screens = append(screens, staticScreen{ID: screen.ID, Title: screen.Title, Route: screen.Route, Status: screen.Status.Label, UseCases: screen.UseCaseIDs, Incoming: screen.IncomingTransitionIDs, Outgoing: screen.OutgoingTransitionIDs})
	}
	if err := writeStaticJSON(output, "screens.json", screens); err != nil {
		return err
	}
	useCases := make([]staticUseCase, 0, len(model.Knowledge.UseCases))
	for _, useCase := range model.Knowledge.UseCases {
		useCases = append(useCases, staticUseCase{ID: useCase.ID, Title: useCase.Title, Status: useCase.Status.Label, Module: useCase.ModuleID, Flows: useCase.FlowIDs, Screens: useCase.ScreenIDs, Start: useCase.StartScreenID, Terminals: useCase.TerminalScreens})
	}
	return writeStaticJSON(output, "use-cases/index.json", useCases)
}

func pageKindFromDocument(kind string) string {
	switch kind {
	case "architecture", "module", "use-case", "flow", "screen", "standard", "runbook":
		return kind
	case "work":
		return "task"
	case "screen-map", "screen-index":
		return "screen"
	case "quality-index":
		return "standard"
	default:
		return "document"
	}
}
