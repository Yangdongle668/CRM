import { io, Socket } from 'socket.io-client';

/**
 * Singleton Socket.IO client for the /ws/messages namespace.
 *
 * Auth: JWT token (from localStorage) is sent via the `auth` payload and
 * as an `Authorization: Bearer …` header so the backend gateway can
 * authenticate the connection.
 *
 * The socket is created lazily on first call and reused across hooks.
 * Token refresh happens by disconnect()+connect() — the token is read
 * again from localStorage at connect time.
 */
let socket: Socket | null = null;

const backendBase =
  (typeof window !== 'undefined' && (window as any).__API_BASE__) ||
  process.env.NEXT_PUBLIC_API_URL ||
  '';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('token');
}

/**
 * Lazily create (and connect) the messages socket.
 * Call this from client components only.
 */
export function getMessagesSocket(): Socket {
  if (socket && socket.connected) return socket;
  if (socket && !socket.connected) {
    socket.connect();
    return socket;
  }

  const token = getToken() || '';
  // If backendBase is empty we use same-origin (the Next.js dev server
  // will proxy /api but websockets need a direct URL — backend mounts the
  // namespace at backendBase + /ws/messages).
  const url = backendBase ? `${backendBase}/ws/messages` : '/ws/messages';

  socket = io(url, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    auth: { token },
    extraHeaders: token ? { Authorization: `Bearer ${token}` } : undefined,
    // `query.token` is a fallback for environments that drop auth header.
    query: token ? { token } : undefined,
  });

  return socket;
}

/**
 * Disconnect and drop the singleton. Call on logout or when you want
 * the next connection to pick up a new token.
 */
export function closeMessagesSocket() {
  if (socket) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {}
    socket = null;
  }
}
