import type {
  ChatConcurrencyLeaseInput,
  ChatConcurrencyLeaseReservation,
  ChatConcurrencyRepository,
} from "@/lib/persistence/chat-concurrency-repository";

type OwnerLeaseStore = Map<string, number>;

const getChatConcurrencyStore = () => {
  const globalState = globalThis as typeof globalThis & {
    __nodesChatConcurrencyStore?: Map<string, OwnerLeaseStore>;
  };
  if (!globalState.__nodesChatConcurrencyStore) {
    globalState.__nodesChatConcurrencyStore = new Map();
  }
  return globalState.__nodesChatConcurrencyStore;
};

const cleanupExpiredLeases = (leases: OwnerLeaseStore, now: number) => {
  for (const [leaseId, expiresAt] of leases) {
    if (expiresAt <= now) {
      leases.delete(leaseId);
    }
  }
};

const getRetryAfterSeconds = (leases: OwnerLeaseStore, now: number) => {
  const earliestExpiry = Math.min(...leases.values());
  if (!Number.isFinite(earliestExpiry)) {
    return 1;
  }
  return Math.max(1, Math.ceil((earliestExpiry - now) / 1_000));
};

const reserveLease = ({
  concurrentLimit,
  expiresAt,
  leaseId,
  now,
  ownerId,
}: ChatConcurrencyLeaseInput): ChatConcurrencyLeaseReservation => {
  const store = getChatConcurrencyStore();
  const leases = store.get(ownerId) ?? new Map<string, number>();
  cleanupExpiredLeases(leases, now);

  if (leases.has(leaseId)) {
    leases.set(leaseId, expiresAt);
    store.set(ownerId, leases);
    return {
      activeCount: leases.size,
      granted: true,
      retryAfterSeconds: 0,
    };
  }

  const normalizedLimit = Math.max(1, Math.floor(concurrentLimit));
  if (leases.size >= normalizedLimit) {
    store.set(ownerId, leases);
    return {
      activeCount: leases.size,
      granted: false,
      retryAfterSeconds: getRetryAfterSeconds(leases, now),
    };
  }

  leases.set(leaseId, expiresAt);
  store.set(ownerId, leases);
  return {
    activeCount: leases.size,
    granted: true,
    retryAfterSeconds: 0,
  };
};

export const fileChatConcurrencyRepository: ChatConcurrencyRepository = {
  async reserveLease(input) {
    return reserveLease(input);
  },

  async releaseLease(ownerId, leaseId) {
    const store = getChatConcurrencyStore();
    const leases = store.get(ownerId);
    if (!leases) return;
    leases.delete(leaseId);
    if (leases.size === 0) {
      store.delete(ownerId);
    }
  },
};

export function __resetFileChatConcurrencyForTests() {
  getChatConcurrencyStore().clear();
}
