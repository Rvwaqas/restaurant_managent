import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UiState {
  sidebarCollapsed: boolean;
  lastVisitedFloor: Record<string, string>; // userId -> floorSlug

  // Device settings (F9)
  soundEnabled: boolean;
  hapticsEnabled: boolean;
  wakeLockEnabled: boolean;
  largeText: boolean;
  deviceSettingsOpen: boolean;
  sessionLocked: boolean;

  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setLastVisitedFloor: (userId: string, floorSlug: string) => void;
  getLastVisitedFloor: (userId: string) => string | undefined;

  setSoundEnabled: (enabled: boolean) => void;
  setHapticsEnabled: (enabled: boolean) => void;
  setWakeLockEnabled: (enabled: boolean) => void;
  setLargeText: (large: boolean) => void;
  setDeviceSettingsOpen: (open: boolean) => void;
  setSessionLocked: (locked: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      lastVisitedFloor: {},

      // Device preferences defaults
      soundEnabled: false,    // default sound off
      hapticsEnabled: true,   // default haptics on
      wakeLockEnabled: false,
      largeText: false,
      deviceSettingsOpen: false,
      sessionLocked: false,

      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },

      setSidebarCollapsed: (collapsed: boolean) => {
        set({ sidebarCollapsed: collapsed });
      },

      setLastVisitedFloor: (userId: string, floorSlug: string) => {
        set((state) => ({
          lastVisitedFloor: {
            ...state.lastVisitedFloor,
            [userId]: floorSlug,
          },
        }));
      },

      getLastVisitedFloor: (userId: string) => {
        return get().lastVisitedFloor[userId];
      },

      setSoundEnabled: (enabled: boolean) => {
        set({ soundEnabled: enabled });
      },

      setHapticsEnabled: (enabled: boolean) => {
        set({ hapticsEnabled: enabled });
      },

      setWakeLockEnabled: (enabled: boolean) => {
        set({ wakeLockEnabled: enabled });
      },

      setLargeText: (large: boolean) => {
        set({ largeText: large });
        if (typeof document !== "undefined") {
          if (large) {
            document.documentElement.classList.add("text-large");
          } else {
            document.documentElement.classList.remove("text-large");
          }
        }
      },

      setDeviceSettingsOpen: (open: boolean) => {
        set({ deviceSettingsOpen: open });
      },

      setSessionLocked: (locked: boolean) => {
        set({ sessionLocked: locked });
      },
    }),
    {
      name: "pos-ui-storage",
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        lastVisitedFloor: state.lastVisitedFloor,
        soundEnabled: state.soundEnabled,
        hapticsEnabled: state.hapticsEnabled,
        wakeLockEnabled: state.wakeLockEnabled,
        largeText: state.largeText,
      }),
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== "undefined") {
          if (state.largeText) {
            document.documentElement.classList.add("text-large");
          }
        }
      },
    }
  )
);
