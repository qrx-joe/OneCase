// AI Provider Abstraction
export interface ExtractionProvider {
  /**
   * 从居民原始信息中提取结构化 Issue Draft
   */
  extractCaseDraft(input: ExtractionInput): Promise<ExtractionResult>
}

export interface ExtractionInput {
  rawText: string
  attachments?: Array<{ type: string; url: string }>
}

export interface ExtractionResult {
  issues: IssueDraft[]
  processingNotes?: string
}

export interface IssueDraft {
  title: string
  summary?: string
  categoryCode?: string
  locationText?: string
  impact: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  urgency: 'LOW' | 'MEDIUM' | 'HIGH' | 'UNKNOWN'
  affectedGroups: string[]
  riskSignals: string[]
  missingInformation: string[]
  evidenceConflict: boolean
  suggestedPriority?: 'P1' | 'P2' | 'P3' | 'UNKNOWN'
}
