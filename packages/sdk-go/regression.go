package agentops

import (
	"context"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

// AssertionType represents the type of assertion.
type AssertionType string

const (
	AssertionTypeEquals      AssertionType = "equals"
	AssertionTypeContains    AssertionType = "contains"
	AssertionTypeNotContains AssertionType = "not_contains"
	AssertionTypeMatches     AssertionType = "matches"
	AssertionTypeGreaterThan AssertionType = "greater_than"
	AssertionTypeLessThan    AssertionType = "less_than"
	AssertionTypeBetween     AssertionType = "between"
	AssertionTypeSimilarity  AssertionType = "similarity"
	AssertionTypeCustom      AssertionType = "custom"
)

// TestStatus represents the status of a test.
type TestStatus string

const (
	TestStatusPending TestStatus = "pending"
	TestStatusRunning TestStatus = "running"
	TestStatusPassed  TestStatus = "passed"
	TestStatusFailed  TestStatus = "failed"
	TestStatusError   TestStatus = "error"
	TestStatusSkipped TestStatus = "skipped"
)

// Assertion represents a test assertion.
type Assertion struct {
	Type            AssertionType                     `yaml:"type" json:"type"`
	Field           string                            `yaml:"field" json:"field"`
	Value           interface{}                       `yaml:"value" json:"value"`
	Tolerance       *float64                          `yaml:"tolerance,omitempty" json:"tolerance,omitempty"`
	CustomValidator func(actual, expected interface{}) bool `yaml:"-" json:"-"`
	Message         string                            `yaml:"message,omitempty" json:"message,omitempty"`
}

// TestCase represents a single test case.
type TestCase struct {
	Name       string                 `yaml:"name" json:"name"`
	Prompt     string                 `yaml:"prompt" json:"prompt"`
	Assertions []Assertion            `yaml:"assertions" json:"assertions"`
	Context    map[string]interface{} `yaml:"context,omitempty" json:"context,omitempty"`
	Metadata   map[string]interface{} `yaml:"metadata,omitempty" json:"metadata,omitempty"`
	TimeoutMs  *int                   `yaml:"timeout_ms,omitempty" json:"timeout_ms,omitempty"`
	Retries    int                    `yaml:"retries,omitempty" json:"retries,omitempty"`
	Tags       []string               `yaml:"tags,omitempty" json:"tags,omitempty"`
}

// TestSuite represents a collection of test cases.
type TestSuite struct {
	Name        string                 `yaml:"name" json:"name"`
	Version     string                 `yaml:"version" json:"version"`
	Tests       []TestCase             `yaml:"tests" json:"tests"`
	Description string                 `yaml:"description,omitempty" json:"description,omitempty"`
	Config      map[string]interface{} `yaml:"config,omitempty" json:"config,omitempty"`
}

// AssertionResult represents the result of an assertion.
type AssertionResult struct {
	Assertion     Assertion   `json:"assertion"`
	Passed        bool        `json:"passed"`
	ActualValue   interface{} `json:"actual_value"`
	ExpectedValue interface{} `json:"expected_value"`
	Message       string      `json:"message,omitempty"`
}

// TestError represents an error during test execution.
type TestError struct {
	Type    string `json:"type"`
	Message string `json:"message"`
	Stack   string `json:"stack,omitempty"`
}

// TestResult represents the result of a test case.
type TestResult struct {
	TestCase         TestCase          `json:"test_case"`
	Status           TestStatus        `json:"status"`
	AssertionResults []AssertionResult `json:"assertion_results"`
	Error            *TestError        `json:"error,omitempty"`
	Response         string            `json:"response,omitempty"`
	DurationMs       float64           `json:"duration_ms"`
	StartedAt        float64           `json:"started_at"`
	CompletedAt      float64           `json:"completed_at"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

// TestRunSummary contains summary statistics.
type TestRunSummary struct {
	Total      int     `json:"total"`
	Passed     int     `json:"passed"`
	Failed     int     `json:"failed"`
	Errors     int     `json:"errors"`
	Skipped    int     `json:"skipped"`
	DurationMs float64 `json:"duration_ms"`
}

// TestSuiteResult represents the result of running a test suite.
type TestSuiteResult struct {
	Suite       TestSuite      `json:"suite"`
	Results     []TestResult   `json:"results"`
	Summary     TestRunSummary `json:"summary"`
	Status      TestStatus     `json:"status"`
	StartedAt   float64        `json:"started_at"`
	CompletedAt float64        `json:"completed_at"`
}

// LLMResponse represents a response from an LLM.
type LLMResponse struct {
	Content      string                 `json:"content"`
	Model        string                 `json:"model"`
	Usage        map[string]int         `json:"usage"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
	LatencyMs    float64                `json:"latency_ms"`
	FinishReason string                 `json:"finish_reason,omitempty"`
}

// LLMClient is the interface for LLM clients.
type LLMClient interface {
	Complete(ctx context.Context, prompt string, context map[string]interface{}) (*LLMResponse, error)
}

// TestRunnerConfig contains configuration for the test runner.
type TestRunnerConfig struct {
	Parallel     bool   `json:"parallel"`
	MaxParallel  int    `json:"max_parallel"`
	TimeoutMs    int    `json:"timeout_ms"`
	RetryFailed  bool   `json:"retry_failed"`
	MaxRetries   int    `json:"max_retries"`
	FailFast     bool   `json:"fail_fast"`
	BaselinePath string `json:"baseline_path,omitempty"`
	OutputPath   string `json:"output_path,omitempty"`
	Verbose      bool   `json:"verbose"`
}

// DefaultTestRunnerConfig returns default configuration.
func DefaultTestRunnerConfig() TestRunnerConfig {
	return TestRunnerConfig{
		Parallel:    false,
		MaxParallel: 5,
		TimeoutMs:   30000,
		RetryFailed: false,
		MaxRetries:  3,
		FailFast:    false,
		Verbose:     false,
	}
}

// TestCallbacks contains callbacks for test events.
type TestCallbacks struct {
	OnTestStart    func(test TestCase)
	OnTestComplete func(result TestResult)
	OnSuiteStart   func(suite TestSuite)
	OnSuiteComplete func(result TestSuiteResult)
	OnAssertion    func(result AssertionResult)
}

// TestRunner executes test suites.
type TestRunner struct {
	llmClient LLMClient
	config    TestRunnerConfig
	callbacks *TestCallbacks
}

// NewTestRunner creates a new test runner.
func NewTestRunner(llmClient LLMClient, config TestRunnerConfig, callbacks *TestCallbacks) *TestRunner {
	if callbacks == nil {
		callbacks = &TestCallbacks{}
	}
	return &TestRunner{
		llmClient: llmClient,
		config:    config,
		callbacks: callbacks,
	}
}

// RunSuite runs a test suite.
func (r *TestRunner) RunSuite(ctx context.Context, suite TestSuite) (*TestSuiteResult, error) {
	result := &TestSuiteResult{
		Suite:     suite,
		Status:    TestStatusRunning,
		StartedAt: float64(time.Now().UnixMilli()),
	}

	if r.callbacks.OnSuiteStart != nil {
		r.callbacks.OnSuiteStart(suite)
	}

	if r.config.Parallel {
		result.Results = r.runParallel(ctx, suite)
	} else {
		result.Results = r.runSequential(ctx, suite)
	}

	// Calculate summary
	result.Summary = r.calculateSummary(result.Results)
	result.CompletedAt = float64(time.Now().UnixMilli())
	result.Summary.DurationMs = result.CompletedAt - result.StartedAt

	// Determine status
	if result.Summary.Errors > 0 {
		result.Status = TestStatusError
	} else if result.Summary.Failed > 0 {
		result.Status = TestStatusFailed
	} else {
		result.Status = TestStatusPassed
	}

	if r.callbacks.OnSuiteComplete != nil {
		r.callbacks.OnSuiteComplete(*result)
	}

	return result, nil
}

// RunTest runs a single test case.
func (r *TestRunner) RunTest(ctx context.Context, test TestCase, suiteConfig map[string]interface{}) TestResult {
	return r.runTest(ctx, test, suiteConfig)
}

func (r *TestRunner) runSequential(ctx context.Context, suite TestSuite) []TestResult {
	results := make([]TestResult, 0, len(suite.Tests))

	for _, test := range suite.Tests {
		result := r.runTest(ctx, test, suite.Config)
		results = append(results, result)

		if r.config.FailFast && result.Status == TestStatusFailed {
			break
		}
	}

	return results
}

func (r *TestRunner) runParallel(ctx context.Context, suite TestSuite) []TestResult {
	results := make([]TestResult, len(suite.Tests))
	var wg sync.WaitGroup
	sem := make(chan struct{}, r.config.MaxParallel)

	for i, test := range suite.Tests {
		wg.Add(1)
		go func(idx int, t TestCase) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			results[idx] = r.runTest(ctx, t, suite.Config)
		}(i, test)
	}

	wg.Wait()
	return results
}

func (r *TestRunner) runTest(ctx context.Context, test TestCase, suiteConfig map[string]interface{}) TestResult {
	result := TestResult{
		TestCase:  test,
		Status:    TestStatusRunning,
		StartedAt: float64(time.Now().UnixMilli()),
		Metadata:  make(map[string]interface{}),
	}

	if r.callbacks.OnTestStart != nil {
		r.callbacks.OnTestStart(test)
	}

	retries := 0
	if r.config.RetryFailed {
		retries = test.Retries
	}

	timeoutMs := r.config.TimeoutMs
	if test.TimeoutMs != nil {
		timeoutMs = *test.TimeoutMs
	}

	for attempt := 0; attempt <= retries; attempt++ {
		// Create context with timeout
		testCtx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)

		// Get LLM response
		response, err := r.llmClient.Complete(testCtx, test.Prompt, test.Context)
		cancel()

		if err != nil {
			if ctx.Err() == context.DeadlineExceeded {
				result.Status = TestStatusError
				result.Error = &TestError{
					Type:    "TimeoutError",
					Message: fmt.Sprintf("Test timed out after %dms", timeoutMs),
				}
			} else {
				result.Status = TestStatusError
				result.Error = &TestError{
					Type:    "ExecutionError",
					Message: err.Error(),
				}
			}

			if attempt < retries {
				continue
			}
			break
		}

		result.Response = response.Content
		result.Metadata["model"] = response.Model
		result.Metadata["usage"] = response.Usage
		result.Metadata["latency_ms"] = response.LatencyMs

		// Evaluate assertions
		result.AssertionResults = make([]AssertionResult, 0, len(test.Assertions))
		allPassed := true

		for _, assertion := range test.Assertions {
			ar := r.evaluateAssertion(assertion, response)
			result.AssertionResults = append(result.AssertionResults, ar)

			if r.callbacks.OnAssertion != nil {
				r.callbacks.OnAssertion(ar)
			}

			if !ar.Passed {
				allPassed = false
			}
		}

		if allPassed {
			result.Status = TestStatusPassed
		} else {
			result.Status = TestStatusFailed
		}

		if result.Status == TestStatusPassed || attempt >= retries {
			break
		}
	}

	result.CompletedAt = float64(time.Now().UnixMilli())
	result.DurationMs = result.CompletedAt - result.StartedAt

	if r.callbacks.OnTestComplete != nil {
		r.callbacks.OnTestComplete(result)
	}

	return result
}

func (r *TestRunner) evaluateAssertion(assertion Assertion, response *LLMResponse) AssertionResult {
	actual := r.getFieldValue(assertion.Field, response)
	expected := assertion.Value
	passed := false
	var message string

	switch assertion.Type {
	case AssertionTypeEquals:
		passed = fmt.Sprintf("%v", actual) == fmt.Sprintf("%v", expected)

	case AssertionTypeContains:
		actualStr, ok1 := actual.(string)
		expectedStr, ok2 := expected.(string)
		if ok1 && ok2 {
			passed = strings.Contains(strings.ToLower(actualStr), strings.ToLower(expectedStr))
		}

	case AssertionTypeNotContains:
		actualStr, ok1 := actual.(string)
		expectedStr, ok2 := expected.(string)
		if ok1 && ok2 {
			passed = !strings.Contains(strings.ToLower(actualStr), strings.ToLower(expectedStr))
		}

	case AssertionTypeMatches:
		actualStr, ok := actual.(string)
		expectedPattern, okP := expected.(string)
		if ok && okP {
			if re, err := regexp.Compile(expectedPattern); err == nil {
				passed = re.MatchString(actualStr)
			} else {
				message = fmt.Sprintf("Invalid regex: %v", err)
			}
		}

	case AssertionTypeGreaterThan:
		actualFloat := toFloat64(actual)
		expectedFloat := toFloat64(expected)
		passed = actualFloat > expectedFloat

	case AssertionTypeLessThan:
		actualFloat := toFloat64(actual)
		expectedFloat := toFloat64(expected)
		passed = actualFloat < expectedFloat

	case AssertionTypeBetween:
		actualFloat := toFloat64(actual)
		if bounds, ok := expected.([]interface{}); ok && len(bounds) >= 2 {
			min := toFloat64(bounds[0])
			max := toFloat64(bounds[1])
			passed = actualFloat >= min && actualFloat <= max
		} else {
			message = "Between assertion requires [min, max] value"
		}

	case AssertionTypeSimilarity:
		actualStr, ok1 := actual.(string)
		expectedStr, ok2 := expected.(string)
		if ok1 && ok2 {
			tolerance := 0.8
			if assertion.Tolerance != nil {
				tolerance = *assertion.Tolerance
			}
			similarity := calculateSimilarity(actualStr, expectedStr)
			passed = similarity >= tolerance
			message = fmt.Sprintf("Similarity: %.2f", similarity)
		}

	case AssertionTypeCustom:
		if assertion.CustomValidator != nil {
			passed = assertion.CustomValidator(actual, expected)
		} else {
			message = "Custom assertion requires validator function"
		}
	}

	return AssertionResult{
		Assertion:     assertion,
		Passed:        passed,
		ActualValue:   actual,
		ExpectedValue: expected,
		Message:       message,
	}
}

func (r *TestRunner) getFieldValue(field string, response *LLMResponse) interface{} {
	switch field {
	case "content":
		return response.Content
	case "model":
		return response.Model
	case "latency_ms":
		return response.LatencyMs
	case "finish_reason":
		return response.FinishReason
	default:
		if strings.HasPrefix(field, "usage.") {
			usageField := strings.TrimPrefix(field, "usage.")
			if v, ok := response.Usage[usageField]; ok {
				return v
			}
		} else if strings.HasPrefix(field, "metadata.") {
			metaField := strings.TrimPrefix(field, "metadata.")
			if v, ok := response.Metadata[metaField]; ok {
				return v
			}
		}
	}
	return nil
}

func (r *TestRunner) calculateSummary(results []TestResult) TestRunSummary {
	summary := TestRunSummary{Total: len(results)}

	for _, result := range results {
		switch result.Status {
		case TestStatusPassed:
			summary.Passed++
		case TestStatusFailed:
			summary.Failed++
		case TestStatusError:
			summary.Errors++
		case TestStatusSkipped:
			summary.Skipped++
		}
	}

	return summary
}

func toFloat64(v interface{}) float64 {
	switch val := v.(type) {
	case float64:
		return val
	case float32:
		return float64(val)
	case int:
		return float64(val)
	case int64:
		return float64(val)
	case string:
		var f float64
		fmt.Sscanf(val, "%f", &f)
		return f
	default:
		return 0
	}
}

func calculateSimilarity(a, b string) float64 {
	if a == "" || b == "" {
		return 0
	}

	wordsA := make(map[string]bool)
	wordsB := make(map[string]bool)

	for _, w := range strings.Fields(strings.ToLower(a)) {
		wordsA[w] = true
	}
	for _, w := range strings.Fields(strings.ToLower(b)) {
		wordsB[w] = true
	}

	intersection := 0
	for w := range wordsA {
		if wordsB[w] {
			intersection++
		}
	}

	union := len(wordsA) + len(wordsB) - intersection
	if union == 0 {
		return 0
	}

	return float64(intersection) / float64(union)
}
