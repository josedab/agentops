package agentops

import (
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
)

// AlertMetric represents metrics that can be monitored.
type AlertMetric string

const (
	AlertMetricCost         AlertMetric = "cost"
	AlertMetricLatency      AlertMetric = "latency"
	AlertMetricErrorRate    AlertMetric = "error_rate"
	AlertMetricTokenUsage   AlertMetric = "token_usage"
	AlertMetricRequestCount AlertMetric = "request_count"
	AlertMetricSuccessRate  AlertMetric = "success_rate"
	AlertMetricThroughput   AlertMetric = "throughput"
	AlertMetricQualityScore AlertMetric = "quality_score"
)

// AlertCondition represents conditions for triggering alerts.
type AlertCondition string

const (
	AlertConditionExceeds    AlertCondition = "exceeds"
	AlertConditionFallsBelow AlertCondition = "falls_below"
	AlertConditionEquals     AlertCondition = "equals"
	AlertConditionChangesBy  AlertCondition = "changes_by"
	AlertConditionAnomaly    AlertCondition = "anomaly"
)

// AlertTimeWindow represents time windows for aggregation.
type AlertTimeWindow string

const (
	AlertTimeWindowMinute AlertTimeWindow = "minute"
	AlertTimeWindowHour   AlertTimeWindow = "hour"
	AlertTimeWindowDay    AlertTimeWindow = "day"
	AlertTimeWindowWeek   AlertTimeWindow = "week"
	AlertTimeWindowMonth  AlertTimeWindow = "month"
)

// AlertSeverity represents alert severity levels.
type AlertSeverity string

const (
	AlertSeverityLow      AlertSeverity = "low"
	AlertSeverityMedium   AlertSeverity = "medium"
	AlertSeverityHigh     AlertSeverity = "high"
	AlertSeverityCritical AlertSeverity = "critical"
)

// AlertChannel represents notification channels.
type AlertChannel string

const (
	AlertChannelEmail     AlertChannel = "email"
	AlertChannelSlack     AlertChannel = "slack"
	AlertChannelWebhook   AlertChannel = "webhook"
	AlertChannelPagerDuty AlertChannel = "pagerduty"
	AlertChannelSMS       AlertChannel = "sms"
)

// AlertRuleConfig represents an alert rule configuration.
type AlertRuleConfig struct {
	Metric                      AlertMetric     `json:"metric"`
	Condition                   AlertCondition  `json:"condition"`
	Threshold                   float64         `json:"threshold"`
	TimeWindow                  AlertTimeWindow `json:"time_window"`
	Severity                    AlertSeverity   `json:"severity"`
	UserID                      string          `json:"user_id,omitempty"`
	FeatureID                   string          `json:"feature_id,omitempty"`
	Model                       string          `json:"model,omitempty"`
	SessionTag                  string          `json:"session_tag,omitempty"`
	Channels                    []AlertChannel  `json:"channels"`
	NotificationCooldownMinutes int             `json:"notification_cooldown_minutes"`
	Name                        string          `json:"name,omitempty"`
	Description                 string          `json:"description,omitempty"`
	Enabled                     bool            `json:"enabled"`
	CreatedAt                   float64         `json:"created_at"`
}

// DefaultAlertRuleConfig returns a default alert rule config.
func DefaultAlertRuleConfig() AlertRuleConfig {
	return AlertRuleConfig{
		TimeWindow:                  AlertTimeWindowHour,
		Severity:                    AlertSeverityMedium,
		Channels:                    []AlertChannel{AlertChannelEmail},
		NotificationCooldownMinutes: 60,
		Enabled:                     true,
		CreatedAt:                   float64(time.Now().UnixMilli()),
	}
}

// ParsedAlertRule represents the result of parsing an NL query.
type ParsedAlertRule struct {
	Rule          AlertRuleConfig `json:"rule"`
	Confidence    float64         `json:"confidence"`
	OriginalQuery string          `json:"original_query"`
	Ambiguities   []string        `json:"ambiguities,omitempty"`
	Suggestions   []string        `json:"suggestions,omitempty"`
}

// AlertRuleValidation represents validation results.
type AlertRuleValidation struct {
	Valid    bool     `json:"valid"`
	Errors   []string `json:"errors,omitempty"`
	Warnings []string `json:"warnings,omitempty"`
}

// AlertEvent represents a triggered alert.
type AlertEvent struct {
	RuleID      string          `json:"rule_id"`
	RuleConfig  AlertRuleConfig `json:"rule_config"`
	TriggeredAt float64         `json:"triggered_at"`
	MetricValue float64         `json:"metric_value"`
	Threshold   float64         `json:"threshold"`
	Message     string          `json:"message"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// AlertFeedback represents user feedback on an alert.
type AlertFeedback struct {
	AlertID      string  `json:"alert_id"`
	RuleID       string  `json:"rule_id"`
	Helpful      bool    `json:"helpful"`
	FeedbackType string  `json:"feedback_type,omitempty"`
	Comment      string  `json:"comment,omitempty"`
	Timestamp    float64 `json:"timestamp"`
}

// FeedbackStats contains feedback statistics.
type FeedbackStats struct {
	TotalFeedback      int     `json:"total_feedback"`
	HelpfulCount       int     `json:"helpful_count"`
	NotHelpfulCount    int     `json:"not_helpful_count"`
	FalsePositiveCount int     `json:"false_positive_count"`
	TooSensitiveCount  int     `json:"too_sensitive_count"`
	MissedIssueCount   int     `json:"missed_issue_count"`
	HelpfulnessRate    float64 `json:"helpfulness_rate"`
}

// NLParserConfig contains parser configuration.
type NLParserConfig struct {
	UseLLMFallback      bool    `json:"use_llm_fallback"`
	LLMModel            string  `json:"llm_model,omitempty"`
	ConfidenceThreshold float64 `json:"confidence_threshold"`
	MaxSuggestions      int     `json:"max_suggestions"`
	Debug               bool    `json:"debug"`
}

// DefaultNLParserConfig returns default parser config.
func DefaultNLParserConfig() NLParserConfig {
	return NLParserConfig{
		UseLLMFallback:      true,
		ConfidenceThreshold: 0.7,
		MaxSuggestions:      3,
		Debug:               false,
	}
}

// Pattern definitions for NL parsing
var metricPatterns = map[AlertMetric][]string{
	AlertMetricCost:         {`\bcost[s]?\b`, `\bspend(?:ing)?\b`, `\$`, `\bdollar[s]?\b`},
	AlertMetricLatency:      {`\blatenc(?:y|ies)\b`, `\bresponse\s+time`, `\bdelay`, `\bslow`},
	AlertMetricErrorRate:    {`\berror[s]?\s+rate\b`, `\bfailure\s+rate\b`, `\bfail`},
	AlertMetricTokenUsage:   {`\btoken[s]?\b`, `\btoken\s+usage\b`},
	AlertMetricRequestCount: {`\brequest[s]?\s+count\b`, `\bapi\s+call[s]?\b`},
	AlertMetricSuccessRate:  {`\bsuccess\s+rate\b`, `\bcompletion\s+rate\b`},
	AlertMetricThroughput:   {`\bthroughput\b`, `\brequests?\s+per\b`},
	AlertMetricQualityScore: {`\bquality\b`, `\bscore\b`, `\brating\b`},
}

var conditionPatterns = map[AlertCondition][]string{
	AlertConditionExceeds:    {`\bexceed[s]?\b`, `\bgreater\s+than\b`, `\babove\b`, `\bover\b`, `\bmore\s+than\b`, `>`},
	AlertConditionFallsBelow: {`\bfall[s]?\s+below\b`, `\bless\s+than\b`, `\bbelow\b`, `\bunder\b`, `<`},
	AlertConditionChangesBy:  {`\bchange[s]?\s+by\b`, `\bincreas`, `\bdecreas`, `\bspike`, `\bdrop`},
	AlertConditionAnomaly:    {`\banomal`, `\bunusual\b`, `\babnormal\b`},
}

var timeWindowPatterns = map[AlertTimeWindow][]string{
	AlertTimeWindowMinute: {`\bminut`},
	AlertTimeWindowHour:   {`\bhour`},
	AlertTimeWindowDay:    {`\bday`},
	AlertTimeWindowWeek:   {`\bweek`},
	AlertTimeWindowMonth:  {`\bmonth`},
}

var severityPatterns = map[AlertSeverity][]string{
	AlertSeverityCritical: {`\bcritical\b`, `\bsevere\b`, `\bblock`, `\bprod`},
	AlertSeverityHigh:     {`\bhigh\b`, `\burgent\b`, `\bimportant\b`},
	AlertSeverityMedium:   {`\bmedium\b`, `\bmoderate\b`},
	AlertSeverityLow:      {`\blow\b`, `\bminor\b`},
}

// NLAlertParser parses natural language alert queries.
type NLAlertParser struct {
	config NLParserConfig
}

// NewNLAlertParser creates a new NL alert parser.
func NewNLAlertParser(config NLParserConfig) *NLAlertParser {
	return &NLAlertParser{config: config}
}

// Parse parses a natural language query into an alert rule.
func (p *NLAlertParser) Parse(query string) *ParsedAlertRule {
	queryLower := strings.ToLower(strings.TrimSpace(query))
	var ambiguities []string
	var suggestions []string
	confidence := 1.0

	// Extract metric
	metric, metricConfidence := p.extractMetric(queryLower)
	if metric == "" {
		ambiguities = append(ambiguities, "Could not determine metric to monitor")
		metric = AlertMetricCost // Default
		confidence *= 0.5
	}
	confidence *= metricConfidence

	// Extract condition
	condition, conditionConfidence := p.extractCondition(queryLower)
	if condition == "" {
		ambiguities = append(ambiguities, "Could not determine alert condition")
		condition = AlertConditionExceeds // Default
		confidence *= 0.7
	}
	confidence *= conditionConfidence

	// Extract threshold
	threshold, thresholdConfidence := p.extractThreshold(queryLower)
	if threshold == nil {
		ambiguities = append(ambiguities, "Could not determine threshold value")
		defaultThreshold := 100.0
		threshold = &defaultThreshold
		suggestions = append(suggestions, "Please specify a threshold value (e.g., '$10', '500ms', '5%')")
		confidence *= 0.5
	}
	confidence *= thresholdConfidence

	// Extract other fields
	timeWindow := p.extractTimeWindow(queryLower)
	severity := p.extractSeverity(queryLower)
	userID := p.extractUserFilter(queryLower)
	featureID := p.extractFeatureFilter(queryLower)
	model := p.extractModelFilter(queryLower)

	// Build rule
	rule := DefaultAlertRuleConfig()
	rule.Metric = metric
	rule.Condition = condition
	rule.Threshold = *threshold
	rule.TimeWindow = timeWindow
	rule.Severity = severity
	rule.UserID = userID
	rule.FeatureID = featureID
	rule.Model = model

	// Generate suggestions if low confidence
	if confidence < p.config.ConfidenceThreshold {
		suggestions = append(suggestions, p.generateSuggestions(rule)...)
	}

	// Limit suggestions
	if len(suggestions) > p.config.MaxSuggestions {
		suggestions = suggestions[:p.config.MaxSuggestions]
	}
	if len(ambiguities) > p.config.MaxSuggestions {
		ambiguities = ambiguities[:p.config.MaxSuggestions]
	}

	return &ParsedAlertRule{
		Rule:          rule,
		Confidence:    confidence,
		OriginalQuery: query,
		Ambiguities:   ambiguities,
		Suggestions:   suggestions,
	}
}

// ValidateRule validates an alert rule.
func (p *NLAlertParser) ValidateRule(rule AlertRuleConfig) *AlertRuleValidation {
	var errors []string
	var warnings []string

	if rule.Threshold < 0 {
		errors = append(errors, "Threshold must be non-negative")
	}

	if rule.Metric == AlertMetricErrorRate && rule.Threshold > 100 {
		warnings = append(warnings, "Error rate threshold seems high (>100%)")
	}

	if rule.NotificationCooldownMinutes < 1 {
		warnings = append(warnings, "Notification cooldown is very short (<1 minute)")
	}

	return &AlertRuleValidation{
		Valid:    len(errors) == 0,
		Errors:   errors,
		Warnings: warnings,
	}
}

func (p *NLAlertParser) extractMetric(query string) (AlertMetric, float64) {
	var bestMatch AlertMetric
	bestCount := 0

	for metric, patterns := range metricPatterns {
		count := 0
		for _, pattern := range patterns {
			if re, err := regexp.Compile(pattern); err == nil && re.MatchString(query) {
				count++
			}
		}
		if count > bestCount {
			bestCount = count
			bestMatch = metric
		}
	}

	if bestCount == 0 {
		return "", 0.5
	}

	confidence := 0.6 + float64(bestCount)*0.15
	if confidence > 1.0 {
		confidence = 1.0
	}

	return bestMatch, confidence
}

func (p *NLAlertParser) extractCondition(query string) (AlertCondition, float64) {
	for condition, patterns := range conditionPatterns {
		for _, pattern := range patterns {
			if re, err := regexp.Compile(pattern); err == nil && re.MatchString(query) {
				return condition, 0.9
			}
		}
	}
	return "", 0.5
}

func (p *NLAlertParser) extractThreshold(query string) (*float64, float64) {
	// Dollar amounts
	dollarRe := regexp.MustCompile(`\$\s*([\d,]+(?:\.\d+)?)`)
	if match := dollarRe.FindStringSubmatch(query); len(match) > 1 {
		value := parseFloat(strings.ReplaceAll(match[1], ",", ""))
		return &value, 0.95
	}

	// Percentages
	percentRe := regexp.MustCompile(`([\d.]+)\s*%`)
	if match := percentRe.FindStringSubmatch(query); len(match) > 1 {
		value := parseFloat(match[1])
		return &value, 0.95
	}

	// Time values (ms)
	msRe := regexp.MustCompile(`(?i)([\d.]+)\s*(?:ms|millisecond)`)
	if match := msRe.FindStringSubmatch(query); len(match) > 1 {
		value := parseFloat(match[1])
		return &value, 0.95
	}

	// Seconds
	secRe := regexp.MustCompile(`(?i)([\d.]+)\s*(?:s|second)`)
	if match := secRe.FindStringSubmatch(query); len(match) > 1 {
		value := parseFloat(match[1]) * 1000
		return &value, 0.95
	}

	// Generic numbers
	numRe := regexp.MustCompile(`(?:^|[^\d])([\d,]+(?:\.\d+)?)(?:[^\d]|$)`)
	if match := numRe.FindStringSubmatch(query); len(match) > 1 {
		value := parseFloat(strings.ReplaceAll(match[1], ",", ""))
		return &value, 0.7
	}

	return nil, 0.3
}

func (p *NLAlertParser) extractTimeWindow(query string) AlertTimeWindow {
	for window, patterns := range timeWindowPatterns {
		for _, pattern := range patterns {
			if re, err := regexp.Compile(pattern); err == nil && re.MatchString(query) {
				return window
			}
		}
	}
	return AlertTimeWindowHour
}

func (p *NLAlertParser) extractSeverity(query string) AlertSeverity {
	for severity, patterns := range severityPatterns {
		for _, pattern := range patterns {
			if re, err := regexp.Compile(pattern); err == nil && re.MatchString(query) {
				return severity
			}
		}
	}
	return AlertSeverityMedium
}

func (p *NLAlertParser) extractUserFilter(query string) string {
	re := regexp.MustCompile(`(?i)(?:for\s+)?user[:\s]+([a-zA-Z0-9_@.-]+)`)
	if match := re.FindStringSubmatch(query); len(match) > 1 {
		return match[1]
	}
	return ""
}

func (p *NLAlertParser) extractFeatureFilter(query string) string {
	re := regexp.MustCompile(`(?i)(?:for\s+)?feature[:\s]+([a-zA-Z0-9_-]+)`)
	if match := re.FindStringSubmatch(query); len(match) > 1 {
		return match[1]
	}
	return ""
}

func (p *NLAlertParser) extractModelFilter(query string) string {
	models := []string{"gpt-4", "gpt-4-turbo", "gpt-4o", "gpt-3.5-turbo", "claude-3", "claude-2", "gemini"}
	queryLower := strings.ToLower(query)
	for _, model := range models {
		if strings.Contains(queryLower, model) {
			return model
		}
	}
	return ""
}

func (p *NLAlertParser) generateSuggestions(rule AlertRuleConfig) []string {
	var suggestions []string
	suggestions = append(suggestions, fmt.Sprintf("Did you mean: Alert when %s %s %.2f?",
		rule.Metric, rule.Condition, rule.Threshold))

	if rule.UserID == "" && rule.FeatureID == "" {
		suggestions = append(suggestions, "Tip: Add filters like 'for user X' or 'for feature Y' to narrow the scope")
	}
	return suggestions
}

func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}

// RuleEngineConfig contains rule engine configuration.
type RuleEngineConfig struct {
	MaxRulesPerOrg              int            `json:"max_rules_per_org"`
	EvaluationIntervalSeconds   float64        `json:"evaluation_interval_seconds"`
	EnableNotifications         bool           `json:"enable_notifications"`
	DefaultChannels             []AlertChannel `json:"default_channels"`
}

// DefaultRuleEngineConfig returns default config.
func DefaultRuleEngineConfig() RuleEngineConfig {
	return RuleEngineConfig{
		MaxRulesPerOrg:            100,
		EvaluationIntervalSeconds: 60,
		EnableNotifications:       true,
		DefaultChannels:           []AlertChannel{AlertChannelEmail},
	}
}

// MetricsProvider is a function that provides metric values.
type MetricsProvider func(orgID string, metric AlertMetric, timeWindow string) float64

// RuleEngineCallbacks contains rule engine callbacks.
type RuleEngineCallbacks struct {
	OnRuleAdded    func(ruleID string, rule AlertRuleConfig)
	OnRuleRemoved  func(ruleID string)
	OnRuleTriggered func(event AlertEvent)
	OnAlertSent    func(event AlertEvent, channel AlertChannel)
}

// NLRuleEngine manages and evaluates alert rules.
type NLRuleEngine struct {
	config          RuleEngineConfig
	callbacks       *RuleEngineCallbacks
	metricsProvider MetricsProvider
	rules           map[string]map[string]AlertRuleConfig // orgID -> ruleID -> rule
	lastTriggered   map[string]float64                    // ruleID -> timestamp
	running         bool
	mu              sync.RWMutex
	done            chan struct{}
}

// NewNLRuleEngine creates a new rule engine.
func NewNLRuleEngine(config RuleEngineConfig, callbacks *RuleEngineCallbacks, metricsProvider MetricsProvider) *NLRuleEngine {
	if callbacks == nil {
		callbacks = &RuleEngineCallbacks{}
	}
	return &NLRuleEngine{
		config:          config,
		callbacks:       callbacks,
		metricsProvider: metricsProvider,
		rules:           make(map[string]map[string]AlertRuleConfig),
		lastTriggered:   make(map[string]float64),
		done:            make(chan struct{}),
	}
}

// AddRule adds an alert rule.
func (e *NLRuleEngine) AddRule(orgID string, rule AlertRuleConfig, ruleID string) (string, error) {
	e.mu.Lock()
	defer e.mu.Unlock()

	if _, ok := e.rules[orgID]; !ok {
		e.rules[orgID] = make(map[string]AlertRuleConfig)
	}

	if len(e.rules[orgID]) >= e.config.MaxRulesPerOrg {
		return "", fmt.Errorf("maximum rules (%d) reached for organization", e.config.MaxRulesPerOrg)
	}

	if ruleID == "" {
		ruleID = uuid.New().String()
	}

	e.rules[orgID][ruleID] = rule

	if e.callbacks.OnRuleAdded != nil {
		e.callbacks.OnRuleAdded(ruleID, rule)
	}

	return ruleID, nil
}

// RemoveRule removes an alert rule.
func (e *NLRuleEngine) RemoveRule(orgID, ruleID string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	if orgRules, ok := e.rules[orgID]; ok {
		if _, exists := orgRules[ruleID]; exists {
			delete(orgRules, ruleID)
			delete(e.lastTriggered, ruleID)

			if e.callbacks.OnRuleRemoved != nil {
				e.callbacks.OnRuleRemoved(ruleID)
			}
			return true
		}
	}
	return false
}

// GetRule gets a specific rule.
func (e *NLRuleEngine) GetRule(orgID, ruleID string) *AlertRuleConfig {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if orgRules, ok := e.rules[orgID]; ok {
		if rule, exists := orgRules[ruleID]; exists {
			return &rule
		}
	}
	return nil
}

// GetRules gets all rules for an organization.
func (e *NLRuleEngine) GetRules(orgID string) map[string]AlertRuleConfig {
	e.mu.RLock()
	defer e.mu.RUnlock()

	result := make(map[string]AlertRuleConfig)
	if orgRules, ok := e.rules[orgID]; ok {
		for k, v := range orgRules {
			result[k] = v
		}
	}
	return result
}

// EvaluateRules evaluates all rules for an organization.
func (e *NLRuleEngine) EvaluateRules(orgID string, metrics map[AlertMetric]float64) []AlertEvent {
	e.mu.Lock()
	defer e.mu.Unlock()

	var events []AlertEvent
	now := float64(time.Now().UnixMilli())

	orgRules, ok := e.rules[orgID]
	if !ok {
		return events
	}

	for ruleID, rule := range orgRules {
		if !rule.Enabled {
			continue
		}

		// Check cooldown
		lastTriggered := e.lastTriggered[ruleID]
		cooldownMs := float64(rule.NotificationCooldownMinutes * 60 * 1000)
		if now-lastTriggered < cooldownMs {
			continue
		}

		// Get metric value
		var metricValue float64
		if v, ok := metrics[rule.Metric]; ok {
			metricValue = v
		} else if e.metricsProvider != nil {
			metricValue = e.metricsProvider(orgID, rule.Metric, string(rule.TimeWindow))
		} else {
			continue
		}

		// Evaluate condition
		triggered := e.evaluateCondition(rule.Condition, metricValue, rule.Threshold)

		if triggered {
			event := AlertEvent{
				RuleID:      ruleID,
				RuleConfig:  rule,
				TriggeredAt: now,
				MetricValue: metricValue,
				Threshold:   rule.Threshold,
				Message:     e.buildAlertMessage(rule, metricValue),
				Metadata: map[string]interface{}{
					"org_id":     orgID,
					"user_id":    rule.UserID,
					"feature_id": rule.FeatureID,
					"model":      rule.Model,
				},
			}
			events = append(events, event)
			e.lastTriggered[ruleID] = now

			if e.callbacks.OnRuleTriggered != nil {
				e.callbacks.OnRuleTriggered(event)
			}
		}
	}

	return events
}

func (e *NLRuleEngine) evaluateCondition(condition AlertCondition, actual, threshold float64) bool {
	switch condition {
	case AlertConditionExceeds:
		return actual > threshold
	case AlertConditionFallsBelow:
		return actual < threshold
	case AlertConditionEquals:
		return actual == threshold
	default:
		return false
	}
}

func (e *NLRuleEngine) buildAlertMessage(rule AlertRuleConfig, actualValue float64) string {
	var actualStr, thresholdStr string

	switch rule.Metric {
	case AlertMetricCost:
		actualStr = fmt.Sprintf("$%.2f", actualValue)
		thresholdStr = fmt.Sprintf("$%.2f", rule.Threshold)
	case AlertMetricLatency:
		actualStr = fmt.Sprintf("%.0fms", actualValue)
		thresholdStr = fmt.Sprintf("%.0fms", rule.Threshold)
	case AlertMetricErrorRate, AlertMetricSuccessRate:
		actualStr = fmt.Sprintf("%.1f%%", actualValue)
		thresholdStr = fmt.Sprintf("%.1f%%", rule.Threshold)
	default:
		actualStr = fmt.Sprintf("%.2f", actualValue)
		thresholdStr = fmt.Sprintf("%.2f", rule.Threshold)
	}

	msg := fmt.Sprintf("Alert: %s %s threshold - actual: %s, threshold: %s",
		rule.Metric, rule.Condition, actualStr, thresholdStr)

	if rule.UserID != "" {
		msg += fmt.Sprintf(" (user: %s)", rule.UserID)
	}
	if rule.FeatureID != "" {
		msg += fmt.Sprintf(" (feature: %s)", rule.FeatureID)
	}

	return msg
}

// FeedbackCollector collects and analyzes alert feedback.
type FeedbackCollector struct {
	feedback   map[string][]AlertFeedback // ruleID -> feedback list
	statsCache map[string]*FeedbackStats
	mu         sync.RWMutex
}

// NewFeedbackCollector creates a new feedback collector.
func NewFeedbackCollector() *FeedbackCollector {
	return &FeedbackCollector{
		feedback:   make(map[string][]AlertFeedback),
		statsCache: make(map[string]*FeedbackStats),
	}
}

// RecordFeedback records user feedback.
func (c *FeedbackCollector) RecordFeedback(feedback AlertFeedback) {
	c.mu.Lock()
	defer c.mu.Unlock()

	c.feedback[feedback.RuleID] = append(c.feedback[feedback.RuleID], feedback)
	delete(c.statsCache, feedback.RuleID)
}

// GetFeedback gets feedback for a rule.
func (c *FeedbackCollector) GetFeedback(ruleID string, limit int) []AlertFeedback {
	c.mu.RLock()
	defer c.mu.RUnlock()

	feedbackList := c.feedback[ruleID]
	if limit > 0 && len(feedbackList) > limit {
		return feedbackList[len(feedbackList)-limit:]
	}
	return feedbackList
}

// GetStats gets feedback statistics.
func (c *FeedbackCollector) GetStats(ruleID string) *FeedbackStats {
	c.mu.Lock()
	defer c.mu.Unlock()

	if cached, ok := c.statsCache[ruleID]; ok {
		return cached
	}

	feedbackList := c.feedback[ruleID]
	if len(feedbackList) == 0 {
		return &FeedbackStats{}
	}

	stats := &FeedbackStats{
		TotalFeedback: len(feedbackList),
	}

	for _, f := range feedbackList {
		if f.Helpful {
			stats.HelpfulCount++
		} else {
			stats.NotHelpfulCount++
		}
		switch f.FeedbackType {
		case "false_positive":
			stats.FalsePositiveCount++
		case "too_sensitive":
			stats.TooSensitiveCount++
		case "missed_issue":
			stats.MissedIssueCount++
		}
	}

	if stats.TotalFeedback > 0 {
		stats.HelpfulnessRate = float64(stats.HelpfulCount) / float64(stats.TotalFeedback)
	}

	c.statsCache[ruleID] = stats
	return stats
}

// GetImprovementSuggestions returns suggestions based on feedback.
func (c *FeedbackCollector) GetImprovementSuggestions(ruleID string) []string {
	stats := c.GetStats(ruleID)
	var suggestions []string

	if stats.TotalFeedback < 5 {
		return []string{"Not enough feedback to make suggestions"}
	}

	if stats.HelpfulnessRate < 0.5 {
		suggestions = append(suggestions, "This rule has low helpfulness - consider reviewing the threshold")
	}

	if float64(stats.FalsePositiveCount) > float64(stats.TotalFeedback)*0.3 {
		suggestions = append(suggestions, "High false positive rate - consider increasing the threshold")
	}

	if float64(stats.TooSensitiveCount) > float64(stats.TotalFeedback)*0.2 {
		suggestions = append(suggestions, "Rule may be too sensitive - consider adjusting the time window or threshold")
	}

	if float64(stats.MissedIssueCount) > float64(stats.TotalFeedback)*0.1 {
		suggestions = append(suggestions, "Rule may be missing issues - consider lowering the threshold")
	}

	if len(suggestions) == 0 {
		suggestions = append(suggestions, "Rule appears to be performing well based on feedback")
	}

	return suggestions
}

// ClearFeedback clears feedback for a rule.
func (c *FeedbackCollector) ClearFeedback(ruleID string) {
	c.mu.Lock()
	defer c.mu.Unlock()

	delete(c.feedback, ruleID)
	delete(c.statsCache, ruleID)
}
