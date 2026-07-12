export type ChatConcurrencyLeaseReservation = {
  activeCount: number;
  granted: boolean;
  retryAfterSeconds: number;
};

export type ChatConcurrencyLeaseInput = {
  concurrentLimit: number;
  expiresAt: number;
  leaseId: string;
  now: number;
  ownerId: string;
};

export interface ChatConcurrencyRepository {
  reserveLease(input: ChatConcurrencyLeaseInput): Promise<ChatConcurrencyLeaseReservation>;
  releaseLease(ownerId: string, leaseId: string): Promise<void>;
}
