import { create } from 'zustand';
import { loadModels, type LoadProgress } from '../services/ai/llamaBridge';

type AiState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  progress: LoadProgress | null;
  error: string;
  load(): Promise<void>;
};

export const useAiStore = create<AiState>((set, get) => ({
  status: 'idle',
  progress: null,
  error: '',
  async load() {
    if (get().status === 'loading') return;
    set({ status: 'loading', error: '', progress: null });
    try {
      await loadModels(progress => set({ progress }));
      set({ status: 'ready' });
    } catch (e) {
      set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    }
  },
}));
