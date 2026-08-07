package docudocu

import (
	"bufio"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"

	"docu-docu/internal/skillinstall"
	"docu-docu/skills"
)

type skillCLIOptions struct {
	operation      skillinstall.Operation
	agent          string
	scope          skillinstall.Scope
	repositoryRoot string
}

func runSkillCLI(argv []string, stdin io.Reader, stdout, stderr io.Writer, interactive bool) int {
	options, err := parseSkillArguments(argv)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	cwd, err := os.Getwd()
	if err != nil {
		fmt.Fprintln(stderr, "SKILL_ROOT_UNAVAILABLE:", err)
		return 1
	}
	root, err := skillinstall.FindProjectRoot(options.repositoryRoot, cwd)
	if err != nil {
		fmt.Fprintln(stderr, "SKILL_ROOT_UNAVAILABLE:", err)
		return 1
	}
	home, err := os.UserHomeDir()
	if err != nil {
		fmt.Fprintln(stderr, "SKILL_HOME_UNAVAILABLE:", err)
		return 1
	}
	agent := options.agent
	if agent == "auto" {
		detected := skillinstall.Detect(root, home, nil)
		if len(detected) == 1 {
			agent = detected[0]
		} else if interactive {
			agent, err = chooseAgent(stdin, stdout, detected)
			if err != nil {
				fmt.Fprintln(stderr, "SKILL_AGENT_REQUIRED:", err)
				return 1
			}
		} else {
			fmt.Fprintln(stderr, "SKILL_AGENT_REQUIRED: --agent is required when auto-detection finds zero or multiple hosts")
			return 1
		}
	}
	targets, err := skillinstall.ResolveTargets(agent, options.scope, root, home)
	if err != nil {
		fmt.Fprintln(stderr, err)
		return 1
	}
	bundle, err := skills.Load()
	if err != nil {
		fmt.Fprintln(stderr, "SKILL_BUNDLE_INVALID:", err)
		return 1
	}
	plans := make([]skillinstall.Plan, 0, len(targets))
	for _, target := range targets {
		fmt.Fprintf(stdout, "%s target: %s\n", target.Agent, target.Path)
		plans = append(plans, skillinstall.BuildPlan(options.operation, target, bundle))
	}
	failed := false
	for _, plan := range plans {
		if options.operation == skillinstall.Status {
			fmt.Fprintf(stdout, "%s: %s", plan.Target.Agent, plan.Before.State)
			if plan.Before.Detail != "" {
				fmt.Fprintf(stdout, " (%s)", plan.Before.Detail)
			}
			fmt.Fprintln(stdout)
			continue
		}
		if plan.Conflict {
			failed = true
			fmt.Fprintf(stderr, "%s: %s: %s\n", plan.Code, plan.Target.Path, plan.Message)
			continue
		}
		result := skillinstall.Execute(plan, Version)
		if result.Error != nil {
			failed = true
			fmt.Fprintf(stderr, "%s: %s: %v\n", result.Code, plan.Target.Path, result.Error)
			continue
		}
		fmt.Fprintf(stdout, "%s: %s -> %s\n", plan.Target.Agent, plan.Before.State, result.State)
	}
	if failed {
		return 1
	}
	return 0
}

func parseSkillArguments(argv []string) (skillCLIOptions, error) {
	options := skillCLIOptions{agent: "auto", scope: skillinstall.Project}
	if len(argv) < 2 {
		return options, fmt.Errorf("SKILL_USAGE: docu-docu skill install|status|update|uninstall [--agent AGENT] [--scope SCOPE]")
	}
	options.operation = skillinstall.Operation(argv[1])
	if options.operation != skillinstall.Install && options.operation != skillinstall.Status && options.operation != skillinstall.Update && options.operation != skillinstall.Uninstall {
		return options, fmt.Errorf("SKILL_OPERATION_INVALID: unsupported operation %q", argv[1])
	}
	for index := 2; index < len(argv); index++ {
		arg := argv[index]
		value := func() (string, error) {
			if index+1 >= len(argv) || strings.HasPrefix(argv[index+1], "-") {
				return "", fmt.Errorf("SKILL_ARGUMENT_INVALID: %s requires a value", arg)
			}
			index++
			return argv[index], nil
		}
		switch {
		case arg == "--agent":
			options.agent, _ = value()
			if options.agent == "" {
				return options, fmt.Errorf("SKILL_ARGUMENT_INVALID: --agent requires a value")
			}
		case strings.HasPrefix(arg, "--agent="):
			options.agent = strings.TrimPrefix(arg, "--agent=")
		case arg == "--scope":
			selected, err := value()
			if err != nil {
				return options, err
			}
			options.scope = skillinstall.Scope(selected)
		case strings.HasPrefix(arg, "--scope="):
			options.scope = skillinstall.Scope(strings.TrimPrefix(arg, "--scope="))
		case arg == "--repository-root":
			options.repositoryRoot, _ = value()
			if options.repositoryRoot == "" {
				return options, fmt.Errorf("SKILL_ARGUMENT_INVALID: --repository-root requires a value")
			}
		case strings.HasPrefix(arg, "--repository-root="):
			options.repositoryRoot = strings.TrimPrefix(arg, "--repository-root=")
		default:
			return options, fmt.Errorf("SKILL_ARGUMENT_INVALID: unsupported parameter %q", arg)
		}
	}
	if _, ok := skillinstall.Agent(options.agent); !ok && options.agent != "auto" && options.agent != "all" {
		return options, fmt.Errorf("SKILL_AGENT_INVALID: unsupported agent %q", options.agent)
	}
	if options.scope != skillinstall.Project && options.scope != skillinstall.User {
		return options, fmt.Errorf("SKILL_SCOPE_INVALID: unsupported scope %q", options.scope)
	}
	if options.scope == skillinstall.User && options.repositoryRoot != "" {
		return options, fmt.Errorf("SKILL_ARGUMENT_INVALID: --repository-root is available only for project scope")
	}
	return options, nil
}

func chooseAgent(input io.Reader, output io.Writer, detected []string) (string, error) {
	fmt.Fprintln(output, "Select an AI host:")
	entries := skillinstall.Registry()
	for index, entry := range entries {
		marker := ""
		if skillContainsString(detected, entry.Name) {
			marker = " (detected)"
		}
		fmt.Fprintf(output, "  %d) %s%s\n", index+1, entry.Name, marker)
	}
	fmt.Fprintf(output, "  %d) all\nChoice: ", len(entries)+1)
	line, err := bufio.NewReader(input).ReadString('\n')
	if err != nil && len(line) == 0 {
		return "", err
	}
	choice, err := strconv.Atoi(strings.TrimSpace(line))
	if err != nil || choice < 1 || choice > len(entries)+1 {
		return "", fmt.Errorf("invalid selection")
	}
	if choice == len(entries)+1 {
		return "all", nil
	}
	return entries[choice-1].Name, nil
}

func skillContainsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func stdioInteractive(input, output *os.File) bool {
	in, inErr := input.Stat()
	out, outErr := output.Stat()
	return inErr == nil && outErr == nil && in.Mode()&os.ModeCharDevice != 0 && out.Mode()&os.ModeCharDevice != 0
}

func skillHelpRequested(argv []string) bool {
	for _, arg := range argv {
		if arg == "-h" || arg == "--help" {
			return true
		}
	}
	return false
}
