import { createId } from '../lib/id';
import type { ChatMessage } from '../types/message';
import type {
  ChatStore,
  ConversationSummary,
  CreateConversationInput,
  UpdateConversationInput,
} from '../types/transport';

interface StoredConversation extends ConversationSummary {
  messages: ChatMessage[];
}

/**
 * In-memory `ChatStore` — a working reference store for demos/tests. Swap in
 * your own (localStorage, IndexedDB, SQLite, Postgres, your API) by
 * implementing `ChatStore`.
 */
export class MemoryStore implements ChatStore {
  private conversations = new Map<string, StoredConversation>();

  async listConversations(): Promise<ConversationSummary[]> {
    return [...this.conversations.values()]
      .sort((a, b) => (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt))
      .map(({ messages: _messages, ...summary }) => summary);
  }

  async getConversation(id: string): Promise<ConversationSummary | null> {
    const conv = this.conversations.get(id);
    if (!conv) return null;
    return { id: conv.id, title: conv.title, createdAt: conv.createdAt, updatedAt: conv.updatedAt };
  }

  async createConversation(input: CreateConversationInput): Promise<ConversationSummary> {
    const now = new Date().toISOString();
    const summary: StoredConversation = {
      id: input.id ?? createId('conv'),
      title: input.title ?? 'New conversation',
      createdAt: now,
      updatedAt: now,
      messages: input.messages ?? [],
    };
    this.conversations.set(summary.id, summary);
    return summary;
  }

  async updateConversation(id: string, input: UpdateConversationInput): Promise<void> {
    const conv = this.conversations.get(id);
    if (!conv) return;
    const updated: StoredConversation = {
      ...conv,
      title: input.title ?? conv.title,
      messages: input.messages ?? conv.messages,
      updatedAt: new Date().toISOString(),
    };
    this.conversations.set(id, updated);
  }

  async deleteConversation(id: string): Promise<void> {
    this.conversations.delete(id);
  }

  async getMessages(conversationId: string): Promise<ChatMessage[]> {
    return this.conversations.get(conversationId)?.messages ?? [];
  }

  async saveMessage(message: ChatMessage): Promise<void> {
    const owner = message.conversationId ?? this.latestConversationId();
    if (!owner) return;
    let conv = this.conversations.get(owner);
    if (!conv) {
      conv = {
        id: owner,
        title: 'New conversation',
        createdAt: new Date().toISOString(),
      } as StoredConversation;
      conv.messages = [];
      this.conversations.set(owner, conv);
    }
    const idx = conv.messages.findIndex((m) => m.id === message.id);
    if (idx === -1) conv.messages.push(message);
    else conv.messages[idx] = message;
    conv.updatedAt = new Date().toISOString();
    if (conv.title === 'New conversation' && message.role === 'user') {
      conv.title = message.content.slice(0, 60) || 'New conversation';
    }
  }

  private latestConversationId(): string | undefined {
    let best: string | undefined;
    let bestTime = '';
    for (const [id, conv] of this.conversations) {
      const t = conv.updatedAt ?? conv.createdAt;
      if (!bestTime || t > bestTime) {
        best = id;
        bestTime = t;
      }
    }
    return best;
  }
}