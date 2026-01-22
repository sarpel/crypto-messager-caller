import { create } from 'zustand';
import * as Keychain from 'react-native-keychain';

interface UserState {
  userId: string | null;
  phoneHash: string | null;
  identityKey: string | null;
  isAuthenticated: boolean;
  setUser: (userId: string, phoneHash: string, identityKey: string) => void;
  logout: () => void;
}

export const useUserStore = create<UserState>((set) => ({
  userId: null,
  phoneHash: null,
  identityKey: null,
  isAuthenticated: false,

  setUser: (userId, phoneHash, identityKey) => {
    set({ userId, phoneHash, identityKey, isAuthenticated: true });
  },

  logout: async () => {
    set({ userId: null, phoneHash: null, identityKey: null, isAuthenticated: false });
  },
}));
