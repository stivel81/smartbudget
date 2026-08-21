export interface Receipt {
  id: string;
  userId: string;
  imageUrl: string;
  merchant: string;
  total: number;
  purchasedAt: string;
  rawOcrOutput: Record<string, unknown> | null;
  createdAt: string;
}
