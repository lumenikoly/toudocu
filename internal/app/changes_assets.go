package docudocu

import (
	"bytes"
	"encoding/binary"
	"encoding/xml"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"math"
	"net/http"
	"strconv"
	"strings"
)

func buildAssetDiffMetadata(before, after []byte, status string) *AssetDiffMetadata {
	result := &AssetDiffMetadata{}
	if status != "added" && status != "untracked" && len(before) > 0 {
		result.Before = inspectAsset(before)
	}
	if status != "deleted" && len(after) > 0 {
		result.After = inspectAsset(after)
	}
	return result
}

func inspectAsset(content []byte) *AssetMetadata {
	mediaType := http.DetectContentType(content)
	result := &AssetMetadata{MediaType: mediaType}
	if len(content) >= 8 && bytes.Equal(content[:8], []byte("\x89PNG\r\n\x1a\n")) {
		result.MediaType = "image/png"
	}
	if strings.Contains(mediaType, "svg") || bytes.Contains(content[:min(len(content), 512)], []byte("<svg")) {
		result.MediaType = "image/svg+xml"
		result.Width, result.Height = svgDimensions(content)
	} else if width, height, ok := webPDimensions(content); ok {
		result.MediaType, result.Width, result.Height = "image/webp", width, height
	} else if config, _, err := image.DecodeConfig(bytes.NewReader(content)); err == nil {
		result.Width, result.Height = config.Width, config.Height
	}
	if result.Width > 0 && result.Height > 0 {
		result.AspectRatio = math.Round(float64(result.Width)/float64(result.Height)*10000) / 10000
	}
	if len(content) > 25 && bytes.Equal(content[:8], []byte("\x89PNG\r\n\x1a\n")) {
		transparent := content[25] == 4 || content[25] == 6
		result.Transparency = &transparent
	} else if result.MediaType == "image/jpeg" {
		transparent := false
		result.Transparency = &transparent
	} else if result.MediaType == "image/webp" && len(content) >= 21 && string(content[12:16]) == "VP8X" {
		transparent := content[20]&0x10 != 0
		result.Transparency = &transparent
	}
	return result
}

func webPDimensions(content []byte) (int, int, bool) {
	if len(content) < 30 || string(content[:4]) != "RIFF" || string(content[8:12]) != "WEBP" {
		return 0, 0, false
	}
	switch string(content[12:16]) {
	case "VP8X":
		width := 1 + int(content[24]) + int(content[25])<<8 + int(content[26])<<16
		height := 1 + int(content[27]) + int(content[28])<<8 + int(content[29])<<16
		return width, height, true
	case "VP8 ":
		if len(content) >= 30 {
			return int(binary.LittleEndian.Uint16(content[26:28]) & 0x3fff), int(binary.LittleEndian.Uint16(content[28:30]) & 0x3fff), true
		}
	case "VP8L":
		if len(content) >= 25 && content[20] == 0x2f {
			bits := binary.LittleEndian.Uint32(content[21:25])
			return int(bits&0x3fff) + 1, int((bits>>14)&0x3fff) + 1, true
		}
	}
	return 0, 0, true
}

func svgDimensions(content []byte) (int, int) {
	decoder := xml.NewDecoder(bytes.NewReader(content))
	for {
		token, err := decoder.Token()
		if err != nil {
			return 0, 0
		}
		start, ok := token.(xml.StartElement)
		if !ok || strings.ToLower(start.Name.Local) != "svg" {
			continue
		}
		var width, height int
		var viewBox string
		for _, attribute := range start.Attr {
			switch strings.ToLower(attribute.Name.Local) {
			case "width":
				width = svgLength(attribute.Value)
			case "height":
				height = svgLength(attribute.Value)
			case "viewbox":
				viewBox = attribute.Value
			}
		}
		if (width == 0 || height == 0) && viewBox != "" {
			parts := strings.Fields(strings.ReplaceAll(viewBox, ",", " "))
			if len(parts) == 4 {
				if value, err := strconv.ParseFloat(parts[2], 64); err == nil {
					width = int(math.Round(value))
				}
				if value, err := strconv.ParseFloat(parts[3], 64); err == nil {
					height = int(math.Round(value))
				}
			}
		}
		return width, height
	}
}

func svgLength(value string) int {
	value = strings.TrimSpace(value)
	end := 0
	for end < len(value) && (value[end] == '.' || value[end] == '-' || value[end] >= '0' && value[end] <= '9') {
		end++
	}
	parsed, err := strconv.ParseFloat(value[:end], 64)
	if err != nil {
		return 0
	}
	return int(math.Round(parsed))
}
