package caldav

import (
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"

	"github.com/emersion/go-ical"
	"github.com/emersion/go-webdav/caldav"
	"github.com/google/uuid"
)

type CalDAVClient struct {
	httpClient *http.Client
	location   *time.Location
}

type RemoteCalendar struct {
	Name  string `json:"name"`
	Path  string `json:"path"`
	Color string `json:"color"`
}

func NewCalDAVClient(location *time.Location) *CalDAVClient {
	if location == nil {
		location = time.UTC
	}
	return &CalDAVClient{
		httpClient: &http.Client{Timeout: 30 * time.Second},
		location:   location,
	}
}

type basicAuthTransport struct {
	username  string
	password  string
	transport http.RoundTripper
}

func (t *basicAuthTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req.SetBasicAuth(t.username, t.password)
	return t.transport.RoundTrip(req)
}

func (c *CalDAVClient) FetchCalDAV(ctx context.Context, endpoint, username, password, calendarName, sourceName string) ([]ParsedEvent, error) {
	client, paths, err := c.resolveCalendars(ctx, endpoint, username, password, calendarName, sourceName)
	if err != nil {
		return nil, err
	}
	authClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &basicAuthTransport{
			username:  username,
			password:  password,
			transport: http.DefaultTransport,
		},
	}

	now := time.Now()
	start := now.AddDate(0, -6, 0)
	end := now.AddDate(0, 6, 0)

	query := &caldav.CalendarQuery{
		CompFilter: caldav.CompFilter{
			Name: "VCALENDAR",
			Comps: []caldav.CompFilter{{
				Name:  "VEVENT",
				Start: start,
				End:   end,
			}},
		},
	}

	var allEvents []ParsedEvent
	for _, cp := range paths {
		meta, _ := c.getCalendarMetadata(ctx, authClient, endpoint, cp.path)

		objects, err := client.QueryCalendar(ctx, cp.path, query)
		if err != nil {
			log.Printf("query calendar %s: %v", cp.name, err)
			continue
		}

		for _, obj := range objects {
			if obj.Data == nil {
				continue
			}
			for _, comp := range obj.Data.Children {
				if comp.Name != ical.CompEvent {
					continue
				}
				ev := ical.Event{Component: comp}
				parsed := parsedFromICalEvent(ev, c.location)
				parsed.CalendarName = firstNonEmptyCalendar(meta.Name, cp.name, sourceName)
				parsed.CalendarColor = meta.Color
				if parsed.UID != "" && !parsed.StartAt.IsZero() {
					allEvents = append(allEvents, parsed)
				}
			}
		}
	}

	return allEvents, nil
}

func (c *CalDAVClient) FetchICSURL(ctx context.Context, url string) ([]ParsedEvent, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("fetch ICS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("ICS fetch returned %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read ICS body: %w", err)
	}

	return ParseICS(string(body), c.location)
}

func (c *CalDAVClient) CreateCalDAVEvent(ctx context.Context, endpoint, username, password, calendarName, sourceName, title, description, location string, startAt, endAt time.Time, allDay bool) (ParsedEvent, error) {
	client, paths, err := c.resolveCalendars(ctx, endpoint, username, password, calendarName, sourceName)
	if err != nil {
		return ParsedEvent{}, err
	}
	calendarPath := paths[0].path

	uid := uuid.NewString()
	calendar := ical.NewCalendar()
	calendar.Props.SetText(ical.PropProductID, "-//SandersHome//Calendar//EN")
	calendar.Props.SetText(ical.PropVersion, "2.0")

	event := ical.NewEvent()
	event.Props.SetText(ical.PropUID, uid)
	event.Props.SetDateTime(ical.PropDateTimeStamp, time.Now().UTC())
	event.Props.SetText(ical.PropSummary, title)
	if description != "" {
		event.Props.SetText(ical.PropDescription, description)
	}
	if location != "" {
		event.Props.SetText(ical.PropLocation, location)
	}
	if allDay {
		event.Props.SetDate(ical.PropDateTimeStart, startAt)
		event.Props.SetDate(ical.PropDateTimeEnd, endAt)
	} else {
		event.Props.SetDateTime(ical.PropDateTimeStart, startAt)
		event.Props.SetDateTime(ical.PropDateTimeEnd, endAt)
	}
	calendar.Children = append(calendar.Children, event.Component)

	objectPath, err := buildCalendarObjectPath(calendarPath, uid)
	if err != nil {
		return ParsedEvent{}, err
	}

	if _, err := client.PutCalendarObject(ctx, objectPath, calendar); err != nil {
		return ParsedEvent{}, fmt.Errorf("create caldav event: %w", err)
	}

	authClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &basicAuthTransport{
			username:  username,
			password:  password,
			transport: http.DefaultTransport,
		},
	}
	calendarMeta, _ := c.getCalendarMetadata(ctx, authClient, endpoint, calendarPath)

	return ParsedEvent{
		UID:            uid,
		CalendarName:   firstNonEmptyCalendar(calendarMeta.Name, calendarName, sourceName),
		CalendarColor:  calendarMeta.Color,
		Summary:        title,
		Description:    description,
		Location:       location,
		StartAt:        startAt,
		EndAt:          endAt,
		AllDay:         allDay,
		RecurrenceRule: "",
	}, nil
}

func (c *CalDAVClient) ListCalendars(ctx context.Context, endpoint, username, password string) ([]RemoteCalendar, error) {
	authClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &basicAuthTransport{
			username:  username,
			password:  password,
			transport: http.DefaultTransport,
		},
	}

	client, calendars, err := c.discoverCalendars(ctx, endpoint, username, password)
	if err != nil {
		_ = client
		return nil, err
	}

	result := make([]RemoteCalendar, 0, len(calendars))
	for _, cal := range calendars {
		meta, _ := c.getCalendarMetadata(ctx, authClient, endpoint, cal.Path)
		result = append(result, RemoteCalendar{
			Name:  firstNonEmptyCalendar(meta.Name, cal.Name),
			Path:  cal.Path,
			Color: meta.Color,
		})
	}
	return result, nil
}

type calendarPath struct {
	name string
	path string
}

func (c *CalDAVClient) resolveCalendars(ctx context.Context, endpoint, username, password, calendarName, sourceName string) (*caldav.Client, []calendarPath, error) {
	client, calendars, err := c.discoverCalendars(ctx, endpoint, username, password)
	if err != nil {
		return nil, nil, err
	}

	endpointPath, err := calendarPathFromEndpoint(endpoint)
	if err != nil {
		return nil, nil, err
	}

	for _, cal := range calendars {
		if normalizeCalendarPath(cal.Path) == endpointPath {
			return client, []calendarPath{{name: cal.Name, path: cal.Path}}, nil
		}
	}

	for _, cal := range calendars {
		if calendarName != "" && strings.EqualFold(strings.TrimSpace(cal.Name), strings.TrimSpace(calendarName)) {
			return client, []calendarPath{{name: cal.Name, path: cal.Path}}, nil
		}
	}

	for _, cal := range calendars {
		if sourceName != "" && strings.EqualFold(strings.TrimSpace(cal.Name), strings.TrimSpace(sourceName)) {
			return client, []calendarPath{{name: cal.Name, path: cal.Path}}, nil
		}
	}

	if len(calendars) == 0 {
		return nil, nil, fmt.Errorf("no calendars found")
	}

	// No specific match — sync all calendars on this account
	paths := make([]calendarPath, len(calendars))
	for i, cal := range calendars {
		paths[i] = calendarPath{name: cal.Name, path: cal.Path}
	}
	return client, paths, nil
}

func (c *CalDAVClient) discoverCalendars(ctx context.Context, endpoint, username, password string) (*caldav.Client, []caldav.Calendar, error) {
	authClient := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &basicAuthTransport{
			username:  username,
			password:  password,
			transport: http.DefaultTransport,
		},
	}

	client, err := caldav.NewClient(authClient, endpoint)
	if err != nil {
		return nil, nil, fmt.Errorf("create caldav client: %w", err)
	}

	principal, err := client.FindCurrentUserPrincipal(ctx)
	if err != nil {
		return nil, nil, fmt.Errorf("find principal: %w", err)
	}

	homeSet, err := client.FindCalendarHomeSet(ctx, principal)
	if err != nil || strings.TrimSpace(homeSet) == "" {
		homeSet = principal
	}

	calendars, err := client.FindCalendars(ctx, homeSet)
	if err != nil || len(calendars) == 0 {
		if normalizeCalendarPath(homeSet) != normalizeCalendarPath(principal) {
			calendars, err = client.FindCalendars(ctx, principal)
		}
	}
	if err != nil {
		return nil, nil, fmt.Errorf("find calendars: %w", err)
	}
	return client, calendars, nil
}

func buildCalendarObjectPath(endpoint, uid string) (string, error) {
	return path.Join(endpoint, uid+".ics"), nil
}

func calendarPathFromEndpoint(endpoint string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", fmt.Errorf("invalid calendar URL: %w", err)
	}
	return normalizeCalendarPath(u.Path), nil
}

func normalizeCalendarPath(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" || trimmed == "/" {
		return "/"
	}
	return strings.TrimRight(trimmed, "/")
}

type calendarMetadata struct {
	Name  string
	Color string
}

func (c *CalDAVClient) getCalendarMetadata(ctx context.Context, authClient *http.Client, endpoint, calendarPath string) (calendarMetadata, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return calendarMetadata{}, err
	}
	u.Path = calendarPath
	req, err := http.NewRequestWithContext(ctx, "PROPFIND", u.String(), strings.NewReader(`<?xml version="1.0" encoding="utf-8" ?><propfind xmlns="DAV:" xmlns:ICAL="http://apple.com/ns/ical/"><prop><displayname/><ICAL:calendar-color/></prop></propfind>`))
	if err != nil {
		return calendarMetadata{}, err
	}
	req.Header.Set("Depth", "0")
	req.Header.Set("Content-Type", "application/xml")
	resp, err := authClient.Do(req)
	if err != nil {
		return calendarMetadata{}, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return calendarMetadata{}, err
	}
	type prop struct {
		DisplayName   string `xml:"displayname"`
		CalendarColor string `xml:"calendar-color"`
	}
	type propstat struct {
		Prop prop `xml:"prop"`
	}
	type response struct {
		Propstats []propstat `xml:"propstat"`
	}
	type multistatus struct {
		Responses []response `xml:"response"`
	}
	var doc multistatus
	if err := xml.Unmarshal(body, &doc); err != nil {
		return calendarMetadata{}, err
	}
	for _, res := range doc.Responses {
		for _, propstat := range res.Propstats {
			if propstat.Prop.DisplayName != "" || propstat.Prop.CalendarColor != "" {
				return calendarMetadata{Name: propstat.Prop.DisplayName, Color: propstat.Prop.CalendarColor}, nil
			}
		}
	}
	return calendarMetadata{}, nil
}

func firstNonEmptyCalendar(values ...string) string {
	for _, value := range values {
		if value != "" {
			return value
		}
	}
	return ""
}

func parsedFromICalEvent(ev ical.Event, loc *time.Location) ParsedEvent {
	parsed := ParsedEvent{}

	parsed.UID, _ = ev.Props.Text(ical.PropUID)
	parsed.Summary, _ = ev.Props.Text(ical.PropSummary)
	parsed.Description, _ = ev.Props.Text(ical.PropDescription)
	parsed.Location, _ = ev.Props.Text(ical.PropLocation)

	dtStart, err := ev.DateTimeStart(loc)
	if err == nil {
		parsed.StartAt = dtStart
	}

	dtEnd, err := ev.DateTimeEnd(loc)
	if err == nil {
		parsed.EndAt = dtEnd
	}

	if dtStartProp := ev.Props.Get(ical.PropDateTimeStart); dtStartProp != nil {
		if v := dtStartProp.Params.Get("VALUE"); v == "DATE" {
			parsed.AllDay = true
			if parsed.EndAt.IsZero() {
				parsed.EndAt = parsed.StartAt.Add(24 * time.Hour)
			}
		}
	}

	if rruleProp := ev.Props.Get(ical.PropRecurrenceRule); rruleProp != nil {
		parsed.RecurrenceRule = rruleProp.Value
	}

	return parsed
}
