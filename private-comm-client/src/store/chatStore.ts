import { create } from 'zustand';

export interface Message {
  id: string;
  senderId: string;
  content: string;
  timestamp: string;
  isEncrypted: boolean;
}

interface ChatState {
  messages: Record<string, Message[]>;
  currentChat: string | null;
  addMessage: (recipientId: string, message: Message) => void;
  setCurrentChat: (recipientId: string | null) => void;
  getMessages: (recipientId: string) => Message[];
  clearChat: (recipientId: string) => void;
}

export const useChatStore = create<ChatState>((set, get) => ({
  messages: {},
  currentChat: null,

  addMessage: (recipientId, message) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [recipientId]: [...(state.messages[recipientId] || []), message],
      },
    }));
  },

  setCurrentChat: (recipientId) => {
    set({ currentChat: recipientId });
  },

  getMessages: (recipientId) => {
    return get().messages[recipientId] || [];
  },

  clearChat: (recipientId) => {
    set((state) => ({
      messages: {
        ...state.messages,
        [recipientId]: [],
      },
    }));
  },
}));
