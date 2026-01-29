package agentops

import (
	"math"
	"testing"
)

func TestCalculateCost(t *testing.T) {
	tests := []struct {
		name             string
		model            string
		promptTokens     int
		completionTokens int
		expectedCost     float64
		tolerance        float64
	}{
		{
			name:             "GPT-4o cost calculation",
			model:            "gpt-4o",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.005/1K = $0.005
			// Output: 500 * $0.015/1K = $0.0075
			// Total: $0.0125
			expectedCost: 0.0125,
			tolerance:    0.0001,
		},
		{
			name:             "GPT-4o-mini cost calculation",
			model:            "gpt-4o-mini",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.00015/1K = $0.00015
			// Output: 500 * $0.0006/1K = $0.0003
			// Total: $0.00045
			expectedCost: 0.00045,
			tolerance:    0.00001,
		},
		{
			name:             "Claude 3.5 Sonnet cost calculation",
			model:            "claude-3-5-sonnet",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.003/1K = $0.003
			// Output: 500 * $0.015/1K = $0.0075
			// Total: $0.0105
			expectedCost: 0.0105,
			tolerance:    0.0001,
		},
		{
			name:             "Claude 3 Opus cost calculation",
			model:            "claude-3-opus",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.015/1K = $0.015
			// Output: 500 * $0.075/1K = $0.0375
			// Total: $0.0525
			expectedCost: 0.0525,
			tolerance:    0.0001,
		},
		{
			name:             "Claude 3 Haiku cost calculation",
			model:            "claude-3-haiku",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.00025/1K = $0.00025
			// Output: 500 * $0.00125/1K = $0.000625
			// Total: $0.000875
			expectedCost: 0.000875,
			tolerance:    0.00001,
		},
		{
			name:             "O1 cost calculation",
			model:            "o1",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.015/1K = $0.015
			// Output: 500 * $0.06/1K = $0.03
			// Total: $0.045
			expectedCost: 0.045,
			tolerance:    0.001,
		},
		{
			name:             "GPT-3.5 Turbo cost calculation",
			model:            "gpt-3.5-turbo",
			promptTokens:     1000,
			completionTokens: 500,
			// Input: 1000 * $0.0005/1K = $0.0005
			// Output: 500 * $0.0015/1K = $0.00075
			// Total: $0.00125
			expectedCost: 0.00125,
			tolerance:    0.0001,
		},
		{
			name:             "Unknown model returns zero",
			model:            "unknown-model",
			promptTokens:     1000,
			completionTokens: 500,
			expectedCost:     0,
			tolerance:        0,
		},
		{
			name:             "Zero tokens returns zero cost",
			model:            "gpt-4o",
			promptTokens:     0,
			completionTokens: 0,
			expectedCost:     0,
			tolerance:        0,
		},
		{
			name:             "Only prompt tokens",
			model:            "gpt-4o",
			promptTokens:     1000,
			completionTokens: 0,
			// Input: 1000 * $0.005/1K = $0.005
			expectedCost: 0.005,
			tolerance:    0.0001,
		},
		{
			name:             "Only completion tokens",
			model:            "gpt-4o",
			promptTokens:     0,
			completionTokens: 1000,
			// Output: 1000 * $0.015/1K = $0.015
			expectedCost: 0.015,
			tolerance:    0.0001,
		},
		{
			name:             "Large token counts",
			model:            "gpt-4o",
			promptTokens:     100000,
			completionTokens: 50000,
			// Input: 100000 * $0.005/1K = $0.50
			// Output: 50000 * $0.015/1K = $0.75
			// Total: $1.25
			expectedCost: 1.25,
			tolerance:    0.01,
		},
		{
			name:             "Claude with date suffix",
			model:            "claude-3-5-sonnet-20241022",
			promptTokens:     1000,
			completionTokens: 500,
			expectedCost:     0.0105,
			tolerance:        0.0001,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cost := CalculateCost(tt.model, tt.promptTokens, tt.completionTokens)
			
			if math.Abs(cost-tt.expectedCost) > tt.tolerance {
				t.Errorf("CalculateCost(%s, %d, %d) = %f, expected %f (tolerance %f)",
					tt.model, tt.promptTokens, tt.completionTokens, cost, tt.expectedCost, tt.tolerance)
			}
		})
	}
}

func TestModelPricingExists(t *testing.T) {
	expectedModels := []string{
		"gpt-4o",
		"gpt-4o-mini",
		"gpt-4-turbo",
		"gpt-4",
		"gpt-3.5-turbo",
		"o1",
		"o1-mini",
		"claude-3-5-sonnet-20241022",
		"claude-3-5-sonnet",
		"claude-3-5-haiku-20241022",
		"claude-3-5-haiku",
		"claude-3-opus-20240229",
		"claude-3-opus",
		"claude-3-sonnet",
		"claude-3-haiku",
	}

	for _, model := range expectedModels {
		t.Run(model, func(t *testing.T) {
			if _, ok := modelPricing[model]; !ok {
				t.Errorf("expected pricing for model %s", model)
			}
		})
	}
}

func TestCostPrecision(t *testing.T) {
	// Test that small token counts produce accurate costs
	cost := CalculateCost("gpt-4o", 1, 1)
	
	// 1 token input: 0.000005
	// 1 token output: 0.000015
	// Total: 0.00002
	expected := 0.00002
	if math.Abs(cost-expected) > 0.000001 {
		t.Errorf("small token cost incorrect: got %f, expected %f", cost, expected)
	}
}

func TestCostConsistency(t *testing.T) {
	// Cost should be consistent across calls
	cost1 := CalculateCost("gpt-4o", 1000, 500)
	cost2 := CalculateCost("gpt-4o", 1000, 500)
	
	if cost1 != cost2 {
		t.Errorf("costs should be consistent: %f != %f", cost1, cost2)
	}
}

func TestCostLinearity(t *testing.T) {
	// Double the tokens should double the cost
	cost1 := CalculateCost("gpt-4o", 1000, 500)
	cost2 := CalculateCost("gpt-4o", 2000, 1000)
	
	ratio := cost2 / cost1
	if math.Abs(ratio-2.0) > 0.001 {
		t.Errorf("cost should scale linearly: %f / %f = %f (expected 2.0)", cost2, cost1, ratio)
	}
}
