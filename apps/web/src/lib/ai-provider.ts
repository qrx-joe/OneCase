// lib/ai-provider.ts
import { MockProvider } from '@onecase/ai'

const provider = new MockProvider()

export async function analyzeIntake(rawText: string) {
  return provider.extractCaseDraft({ rawText })
}
