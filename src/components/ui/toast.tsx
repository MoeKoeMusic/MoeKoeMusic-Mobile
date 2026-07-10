import { useEffect, useState, useSyncExternalStore } from 'react';
import { Text, View } from 'tamagui';

type ToastState = {
  message: string;
  visible: boolean;
  seq: number;
};

let state: ToastState = { message: '', visible: false, seq: 0 };
const listeners = new Set<() => void>();
let hideTimer: ReturnType<typeof setTimeout> | null = null;

function setState(next: ToastState) {
  state = next;
  for (const listener of listeners) {
    listener();
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function showToast(message: string) {
  if (hideTimer) {
    clearTimeout(hideTimer);
  }
  setState({ message, visible: true, seq: state.seq + 1 });
  hideTimer = setTimeout(() => {
    setState({ ...state, visible: false });
  }, 2200);
}

// 原生 modal 页(如 /player)会盖住根布局的宿主，所以 modal 页内需再挂一个
// ToastHost；同一时刻只有最后挂载的宿主渲染，避免两个药丸叠加。
let hostSeq = 0;
const hostStack: number[] = [];
const hostListeners = new Set<() => void>();

function topHost(): number {
  return hostStack[hostStack.length - 1] ?? -1;
}

function useIsTopHost(): boolean {
  const [id] = useState(() => {
    hostSeq += 1;
    return hostSeq;
  });

  useEffect(() => {
    hostStack.push(id);
    for (const listener of hostListeners) listener();
    return () => {
      const index = hostStack.indexOf(id);
      if (index >= 0) {
        hostStack.splice(index, 1);
      }
      for (const listener of hostListeners) listener();
    };
  }, [id]);

  return useSyncExternalStore(
    (listener) => {
      hostListeners.add(listener);
      return () => {
        hostListeners.delete(listener);
      };
    },
    () => topHost() === id,
    () => false
  );
}

export function ToastHost() {
  const toast = useSyncExternalStore(subscribe, () => state, () => state);
  const isTop = useIsTopHost();

  if (!isTop || !toast.message) {
    return null;
  }

  return (
    <View
      position="absolute"
      left={0}
      right={0}
      bottom={130}
      alignItems="center"
      pointerEvents="none"
      zIndex={200000}>
      <View
        maxWidth={320}
        paddingHorizontal={18}
        paddingVertical={11}
        borderRadius={999}
        backgroundColor="rgba(24, 24, 32, 0.92)"
        opacity={toast.visible ? 1 : 0}
        y={toast.visible ? 0 : 12}
        transition="quick">
        <Text color="#FFFFFF" fontSize={13.5} fontWeight="600" textAlign="center">
          {toast.message}
        </Text>
      </View>
    </View>
  );
}
