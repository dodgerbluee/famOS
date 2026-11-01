package ai

import (
	"encoding/json"
	"strings"
)

type briefingEnvelope struct {
	DailyBriefing
	SandersCashNote string `json:"sandersCashNote"`
}

// parseDailyBriefing recovers complete fields from a response even when the
// provider stops midway through a later JSON field. This keeps raw JSON out of
// the user-facing summary while preserving useful content already generated.
func parseDailyBriefing(text string) (DailyBriefing, bool) {
	jsonText := extractJSON(text)
	var envelope briefingEnvelope
	if err := json.Unmarshal([]byte(jsonText), &envelope); err == nil {
		envelope.SandersCashSummary = firstNonEmptyBriefing(envelope.SandersCashSummary, envelope.SandersCashNote)
		return envelope.DailyBriefing, true
	}

	fields := completeJSONObjectFields(jsonText)
	decodeBriefingField(fields, "date", &envelope.Date)
	decodeBriefingField(fields, "summary", &envelope.Summary)
	decodeBriefingField(fields, "highlights", &envelope.Highlights)
	decodeBriefingField(fields, "weatherSummary", &envelope.WeatherSummary)
	decodeBriefingField(fields, "calendarSummary", &envelope.CalendarSummary)
	decodeBriefingField(fields, "sandersCashSummary", &envelope.SandersCashSummary)
	decodeBriefingField(fields, "sandersCashNote", &envelope.SandersCashNote)
	envelope.SandersCashSummary = firstNonEmptyBriefing(envelope.SandersCashSummary, envelope.SandersCashNote)
	return envelope.DailyBriefing, false
}

func decodeBriefingField(fields map[string]json.RawMessage, name string, target any) {
	if raw, ok := fields[name]; ok {
		_ = json.Unmarshal(raw, target)
	}
}

// normalizeDailyBriefing also repairs cache entries created by the old
// fallback, where an entire malformed JSON response was stored in Summary.
func normalizeDailyBriefing(result DailyBriefing, today string) DailyBriefing {
	result.Date = today
	result.Summary = strings.TrimSpace(result.Summary)
	if strings.HasPrefix(result.Summary, "{") || strings.HasPrefix(result.Summary, "```") {
		if nested, _ := parseDailyBriefing(result.Summary); nested.Summary != "" {
			nested.Date = today
			return nested
		}
	}
	return result
}

// completeJSONObjectFields returns only values that are syntactically
// complete. A final unterminated value is ignored.
func completeJSONObjectFields(text string) map[string]json.RawMessage {
	fields := make(map[string]json.RawMessage)
	start := strings.IndexByte(text, '{')
	if start < 0 {
		return fields
	}

	for i := start + 1; i < len(text); {
		i = skipJSONSpaceAndCommas(text, i)
		if i >= len(text) || text[i] == '}' || text[i] != '"' {
			break
		}
		keyEnd, ok := jsonStringEnd(text, i)
		if !ok {
			break
		}
		var key string
		if json.Unmarshal([]byte(text[i:keyEnd]), &key) != nil {
			break
		}
		i = skipJSONSpace(text, keyEnd)
		if i >= len(text) || text[i] != ':' {
			break
		}
		i = skipJSONSpace(text, i+1)
		valueEnd, ok := jsonValueEnd(text, i)
		if !ok {
			break
		}
		raw := json.RawMessage(text[i:valueEnd])
		if json.Valid(raw) {
			fields[key] = raw
		}
		i = valueEnd
	}
	return fields
}

func skipJSONSpace(text string, i int) int {
	for i < len(text) && (text[i] == ' ' || text[i] == '\n' || text[i] == '\r' || text[i] == '\t') {
		i++
	}
	return i
}

func skipJSONSpaceAndCommas(text string, i int) int {
	for {
		i = skipJSONSpace(text, i)
		if i >= len(text) || text[i] != ',' {
			return i
		}
		i++
	}
}

func jsonStringEnd(text string, start int) (int, bool) {
	escaped := false
	for i := start + 1; i < len(text); i++ {
		if escaped {
			escaped = false
			continue
		}
		switch text[i] {
		case '\\':
			escaped = true
		case '"':
			return i + 1, true
		}
	}
	return 0, false
}

func jsonValueEnd(text string, start int) (int, bool) {
	if start >= len(text) {
		return 0, false
	}
	if text[start] == '"' {
		return jsonStringEnd(text, start)
	}
	if text[start] == '[' || text[start] == '{' {
		stack := []byte{text[start]}
		inString, escaped := false, false
		for i := start + 1; i < len(text); i++ {
			c := text[i]
			if inString {
				if escaped {
					escaped = false
				} else if c == '\\' {
					escaped = true
				} else if c == '"' {
					inString = false
				}
				continue
			}
			switch c {
			case '"':
				inString = true
			case '[', '{':
				stack = append(stack, c)
			case ']', '}':
				want := byte('[')
				if c == '}' {
					want = '{'
				}
				if len(stack) == 0 || stack[len(stack)-1] != want {
					return 0, false
				}
				stack = stack[:len(stack)-1]
				if len(stack) == 0 {
					return i + 1, true
				}
			}
		}
		return 0, false
	}

	end := start
	for end < len(text) && text[end] != ',' && text[end] != '}' {
		end++
	}
	end = len(strings.TrimRight(text[:end], " \n\r\t"))
	return end, end > start
}
