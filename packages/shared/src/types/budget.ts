export interface Budget {
  id: string;
  userId: string;
  categoryId: string;
  monthlyLimit: number;
  alertThreshold: number;
  createdAt: string;
}
