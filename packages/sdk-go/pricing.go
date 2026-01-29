package agentops

// Model pricing per 1000 tokens (as of 2026-01)
var modelPricing = map[string]struct {
	InputCostPer1K  float64
	OutputCostPer1K float64
}{
	// OpenAI
	"gpt-4o":           {0.005, 0.015},
	"gpt-4o-mini":      {0.00015, 0.0006},
	"gpt-4-turbo":      {0.01, 0.03},
	"gpt-4":            {0.03, 0.06},
	"gpt-3.5-turbo":    {0.0005, 0.0015},
	"o1":               {0.015, 0.06},
	"o1-mini":          {0.003, 0.012},
	
	// Anthropic
	"claude-3-5-sonnet-20241022": {0.003, 0.015},
	"claude-3-5-sonnet":          {0.003, 0.015},
	"claude-3-5-haiku-20241022":  {0.001, 0.005},
	"claude-3-5-haiku":           {0.001, 0.005},
	"claude-3-opus-20240229":     {0.015, 0.075},
	"claude-3-opus":              {0.015, 0.075},
	"claude-3-sonnet":            {0.003, 0.015},
	"claude-3-haiku":             {0.00025, 0.00125},
}

// CalculateCost calculates the cost for a model invocation.
func CalculateCost(model string, promptTokens, completionTokens int) float64 {
	pricing, ok := modelPricing[model]
	if !ok {
		return 0
	}

	inputCost := float64(promptTokens) / 1000 * pricing.InputCostPer1K
	outputCost := float64(completionTokens) / 1000 * pricing.OutputCostPer1K

	return inputCost + outputCost
}
