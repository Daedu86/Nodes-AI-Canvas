import type {
  ChatUsageLimits,
  ChatUsageReservation,
  ChatUsageSnapshot,
} from "@/lib/chat-usage";

export interface ChatUsageRepository {
  getUsage(ownerId: string, now: number): Promise<ChatUsageSnapshot | null>;
  reserveUsage(
    ownerId: string,
    limits: ChatUsageLimits,
    now: number,
  ): Promise<ChatUsageReservation>;
}
