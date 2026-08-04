package docudocu

import (
	"encoding/json"
	"fmt"
	"html"
	"io"
	"io/fs"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"
)

var (
	stripFenceRE      = regexp.MustCompile("(?s)```.*?```")
	stripHeadingRE    = regexp.MustCompile(`(?m)^\s{0,3}#{1,6}\s+`)
	stripQuoteRE      = regexp.MustCompile(`(?m)^\s*>\s?`)
	stripListRE       = regexp.MustCompile(`(?m)^\s*(?:[-*+] |\d+[.)] )`)
	stripCheckboxRE   = regexp.MustCompile(`\[[ xX]\]\s*`)
	stripImageRE      = regexp.MustCompile(`!\[([^\]]*)\]\([^)]*\)`)
	stripLinkRE       = regexp.MustCompile(`\[([^\]]+)\]\([^)]*\)`)
	stripInlineCodeRE = regexp.MustCompile("`([^`]+)`")
	stripMarksRE      = regexp.MustCompile("[`*_~|]")
	spacesRE          = regexp.MustCompile(`\s+`)
)

func escapeHTML(value any) string          { return html.EscapeString(fmt.Sprint(value)) }
func escapeAttr(value any) string          { return strings.ReplaceAll(escapeHTML(value), "`", "&#96;") }
func normalizeSlashes(value string) string { return strings.ReplaceAll(value, `\`, "/") }

func toPosixRelative(root, absolutePath string) string {
	rel, err := filepath.Rel(root, absolutePath)
	if err != nil {
		return normalizeSlashes(absolutePath)
	}
	return normalizeSlashes(rel)
}

func slugify(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	hyphen := false
	for _, r := range value {
		switch {
		case r == '`' || r == '*' || r == '~':
			continue
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			b.WriteRune(r)
			hyphen = false
		case unicode.IsSpace(r) || r == '_' || r == '-':
			if b.Len() > 0 && !hyphen {
				b.WriteByte('-')
				hyphen = true
			}
		}
	}
	result := strings.Trim(b.String(), "-")
	if result == "" {
		return "section"
	}
	return result
}

func uniqueSlug(value string, used map[string]struct{}) string {
	base := slugify(value)
	candidate := base
	for i := 2; ; i++ {
		if _, exists := used[candidate]; !exists {
			used[candidate] = struct{}{}
			return candidate
		}
		candidate = fmt.Sprintf("%s-%d", base, i)
	}
}

func stripInlineMarkdown(value string) string {
	value = stripImageRE.ReplaceAllString(value, "$1")
	value = stripLinkRE.ReplaceAllString(value, "$1")
	value = stripInlineCodeRE.ReplaceAllString(value, "$1")
	value = strings.NewReplacer("*", "", "_", "", "~", "").Replace(value)
	return strings.TrimSpace(value)
}

func stripMarkdown(value string) string {
	value = stripFenceRE.ReplaceAllString(value, " ")
	value = stripHeadingRE.ReplaceAllString(value, "")
	value = stripQuoteRE.ReplaceAllString(value, "")
	value = stripListRE.ReplaceAllString(value, "")
	value = stripCheckboxRE.ReplaceAllString(value, "")
	value = stripImageRE.ReplaceAllString(value, "$1")
	value = stripLinkRE.ReplaceAllString(value, "$1")
	value = stripMarksRE.ReplaceAllString(value, " ")
	return strings.TrimSpace(spacesRE.ReplaceAllString(value, " "))
}

func ensureInside(root, candidate string) bool {
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	candidateAbs, err := filepath.Abs(candidate)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(rootAbs, candidateAbs)
	if err != nil {
		return false
	}
	return rel == "." || (rel != ".." && !strings.HasPrefix(rel, ".."+string(filepath.Separator)) && !filepath.IsAbs(rel))
}

// resolvePathForSafety resolves symlinks in the longest existing path prefix and
// appends the still-missing suffix. It is used for destructive-path checks.
func resolvePathForSafety(value string) (string, error) {
	absolute, err := filepath.Abs(value)
	if err != nil {
		return "", err
	}
	current := absolute
	missing := []string{}
	for {
		_, statErr := os.Lstat(current)
		if statErr == nil {
			resolved, err := filepath.EvalSymlinks(current)
			if err != nil {
				return "", err
			}
			for i := len(missing) - 1; i >= 0; i-- {
				resolved = filepath.Join(resolved, missing[i])
			}
			return filepath.Clean(resolved), nil
		}
		if !os.IsNotExist(statErr) {
			return "", statErr
		}
		parent := filepath.Dir(current)
		if parent == current {
			return filepath.Clean(absolute), nil
		}
		missing = append(missing, filepath.Base(current))
		current = parent
	}
}

func samePath(a, b string) bool {
	aa, _ := filepath.Abs(a)
	bb, _ := filepath.Abs(b)
	if os.PathSeparator == '\\' {
		return strings.EqualFold(filepath.Clean(aa), filepath.Clean(bb))
	}
	return filepath.Clean(aa) == filepath.Clean(bb)
}

func safeRemoveDirectory(directory, protectedDirectory string) error {
	requested, err := filepath.Abs(directory)
	if err != nil {
		return err
	}
	if info, statErr := os.Lstat(requested); statErr == nil && info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("отказ от очистки символической ссылки: %s", requested)
	} else if statErr != nil && !os.IsNotExist(statErr) {
		return statErr
	}
	resolved, err := resolvePathForSafety(directory)
	if err != nil {
		return err
	}
	protected, err := resolvePathForSafety(protectedDirectory)
	if err != nil {
		return err
	}
	volume := filepath.VolumeName(resolved)
	root := string(filepath.Separator)
	if volume != "" {
		root = volume + string(filepath.Separator)
	}
	if samePath(resolved, protected) || samePath(resolved, root) || ensureInside(resolved, protected) {
		return fmt.Errorf("отказ от удаления защищённого каталога: %s", resolved)
	}
	return os.RemoveAll(resolved)
}

func mkdirp(directory string) error { return os.MkdirAll(directory, 0o755) }

func writeFileEnsured(filePath string, content []byte) error {
	if err := mkdirp(filepath.Dir(filePath)); err != nil {
		return err
	}
	return os.WriteFile(filePath, content, 0o644)
}

func copyFileEnsured(source, target string) error {
	info, err := os.Lstat(source)
	if err != nil {
		return err
	}
	if info.Mode()&os.ModeSymlink != 0 {
		return fmt.Errorf("символическая ссылка не копируется: %s", source)
	}
	in, err := os.Open(source)
	if err != nil {
		return err
	}
	defer in.Close()
	if err := mkdirp(filepath.Dir(target)); err != nil {
		return err
	}
	out, err := os.Create(target)
	if err != nil {
		return err
	}
	_, copyErr := io.Copy(out, in)
	closeErr := out.Close()
	if copyErr != nil {
		return copyErr
	}
	return closeErr
}

func copyFSFile(sourceFS fs.FS, source, target string) error {
	data, err := fs.ReadFile(sourceFS, source)
	if err != nil {
		return err
	}
	return writeFileEnsured(target, data)
}

func parseDate(value string) (time.Time, bool) {
	text := strings.TrimSpace(value)
	if text == "" {
		return time.Time{}, false
	}
	layouts := []string{
		"2006-01-02",
		time.RFC3339,
		"2006-01-02 15:04:05",
		"02.01.2006", "2.1.2006",
		"02/01/2006", "2/1/2006",
		"02-01-2006", "2-1-2006",
		time.RFC1123, time.RFC822,
	}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, text); err == nil {
			return parsed.UTC(), true
		}
	}
	return time.Time{}, false
}

var russianMonths = [...]string{
	"января", "февраля", "марта", "апреля", "мая", "июня",
	"июля", "августа", "сентября", "октября", "ноября", "декабря",
}

func formatDate(value time.Time) string {
	if value.IsZero() {
		return "—"
	}
	value = value.UTC()
	return fmt.Sprintf("%d %s %d", value.Day(), russianMonths[value.Month()-1], value.Year())
}

func formatDateValue(value string) string {
	if parsed, ok := parseDate(value); ok {
		return formatDate(parsed)
	}
	if strings.TrimSpace(value) == "" {
		return "—"
	}
	return value
}

func progress(completed, total int) *int {
	if total == 0 {
		return nil
	}
	value := int(float64(completed)/float64(total)*100 + 0.5)
	return &value
}

func percentOrZero(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func truncate(value string, maxLength int) string {
	text := strings.TrimSpace(value)
	if maxLength <= 0 || utf8.RuneCountInString(text) <= maxLength {
		return text
	}
	runes := []rune(text)
	if maxLength == 1 {
		return "…"
	}
	return strings.TrimSpace(string(runes[:maxLength-1])) + "…"
}

func naturalCompare(a, b string) int {
	ra := []rune(strings.ToLower(a))
	rb := []rune(strings.ToLower(b))
	ia, ib := 0, 0
	for ia < len(ra) && ib < len(rb) {
		if unicode.IsDigit(ra[ia]) && unicode.IsDigit(rb[ib]) {
			ja, jb := ia, ib
			for ja < len(ra) && unicode.IsDigit(ra[ja]) {
				ja++
			}
			for jb < len(rb) && unicode.IsDigit(rb[jb]) {
				jb++
			}
			na, _ := strconv.ParseUint(string(ra[ia:ja]), 10, 64)
			nb, _ := strconv.ParseUint(string(rb[ib:jb]), 10, 64)
			if na < nb {
				return -1
			}
			if na > nb {
				return 1
			}
			if ja-ia < jb-ib {
				return -1
			}
			if ja-ia > jb-ib {
				return 1
			}
			ia, ib = ja, jb
			continue
		}
		if ra[ia] < rb[ib] {
			return -1
		}
		if ra[ia] > rb[ib] {
			return 1
		}
		ia++
		ib++
	}
	if len(ra) < len(rb) {
		return -1
	}
	if len(ra) > len(rb) {
		return 1
	}
	return 0
}

func sortNatural(values []string) {
	sort.SliceStable(values, func(i, j int) bool { return naturalCompare(values[i], values[j]) < 0 })
}

func relativeURL(fromOutputPath, toOutputPath string) string {
	fromDir := path.Dir(normalizeSlashes(fromOutputPath))
	fromOS := filepath.FromSlash(fromDir)
	toOS := filepath.FromSlash(normalizeSlashes(toOutputPath))
	rel, err := filepath.Rel(fromOS, toOS)
	if err != nil {
		return normalizeSlashes(toOutputPath)
	}
	rel = filepath.ToSlash(rel)
	if rel == "" || rel == "." {
		return path.Base(toOutputPath)
	}
	return rel
}

func rootPrefix(outputPath string) string {
	directory := path.Dir(normalizeSlashes(outputPath))
	if directory == "." {
		return ""
	}
	return strings.Repeat("../", len(strings.Split(strings.Trim(directory, "/"), "/")))
}

func jsonForScript(value any) ([]byte, error) {
	data, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	text := strings.NewReplacer(
		"<", `\u003c`,
		">", `\u003e`,
		"&", `\u0026`,
	).Replace(string(data))
	return []byte(text), nil
}

func canonicalText(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	spacePending := false
	for _, r := range value {
		if r == 'ё' {
			r = 'е'
		}
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			if spacePending && b.Len() > 0 {
				b.WriteByte(' ')
			}
			b.WriteRune(r)
			spacePending = false
		} else {
			spacePending = true
		}
	}
	return strings.TrimSpace(b.String())
}

func uniqueStrings(values []string) []string {
	seen := map[string]struct{}{}
	result := []string{}
	for _, value := range values {
		if value == "" {
			continue
		}
		if _, exists := seen[value]; exists {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func pathEscapeSegment(value string) string {
	var b strings.Builder
	for _, c := range []byte(value) {
		if (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || strings.ContainsRune("-._~", rune(c)) {
			b.WriteByte(c)
		} else {
			fmt.Fprintf(&b, "%%%02X", c)
		}
	}
	return b.String()
}

func encodePathSegments(value string) string {
	parts := strings.Split(normalizeSlashes(value), "/")
	for i, part := range parts {
		parts[i] = pathEscapeSegment(part)
	}
	return strings.Join(parts, "/")
}
