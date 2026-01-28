/**
 * AgentOps SDK - OpenAI Integration Example
 * 
 * This example demonstrates automatic instrumentation with OpenAI.
 * Run with: OPENAI_API_KEY=sk-... npx tsx examples/openai-integration.ts
 */

import OpenAI from 'openai';
import { AgentOps } from '../packages/sdk-ts/src/index.js';

async function main() {
  // Check for API key
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY environment variable is required');
    process.exit(1);
  }

  // Initialize AgentOps
  const agentops = new AgentOps({
    apiKey: process.env.AGENTOPS_API_KEY ?? 'ao_test_12345678901234567890123456',
    endpoint: process.env.AGENTOPS_ENDPOINT ?? 'http://localhost:8787',
    debug: true,
  });

  console.log('🚀 Starting OpenAI integration example...\n');

  // Create OpenAI client and wrap it with AgentOps
  const openai = agentops.wrap(
    new OpenAI(),
    {
      userId: 'user_456',
      featureId: 'openai-chat',
      tags: ['openai', 'example'],
    }
  );

  console.log('🤖 Sending request to OpenAI...\n');

  try {
    // Make an API call - automatically tracked!
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'What are three interesting facts about the moon?' },
      ],
      max_tokens: 200,
    });

    console.log('📝 Response:');
    console.log(completion.choices[0]?.message?.content);
    console.log();

    console.log('📊 Usage:');
    console.log(`  Prompt tokens: ${completion.usage?.prompt_tokens}`);
    console.log(`  Completion tokens: ${completion.usage?.completion_tokens}`);
    console.log(`  Total tokens: ${completion.usage?.total_tokens}`);
    console.log();

  } catch (error) {
    console.error('❌ OpenAI API error:', error);
  }

  // Flush and shutdown
  console.log('🔄 Flushing events...');
  await agentops.flush();
  
  console.log('👋 Shutting down...');
  await agentops.shutdown();

  console.log('\n✨ Example completed!');
}

main().catch(console.error);
