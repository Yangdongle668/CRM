import { io, Socket } from 'socket.io-client';

/**
 * Singleton Socket.IO client for the /ws/messages namespace.
 *
 * Auth: JWT token (from localStorage) is sent via the `auth` payload and
 * as an `Authorization: Bearer …` header so the backend gateway can
 * authenticate the connection.
 *
 * URL resolution (browser-side):
 *   1. `NEXT_PUBLIC_WS_URL` env var — set this to a browser-resolvable
 *      websocket origin if the backend is on a different host (e.g.
 *      "https://api.example.com"). Must NOT be a docker-internal name.
 *   2. Otherwise same-origin — socket.io-client uses `window.location.origin`
 *      and the request reaches the backend via Next.js rewrites
 *      (next.config.js proxies /socket.io/* and /ws/*).
 *
 * We deliberately do NOT fall back to `NEXT_PUBLIC_API_URL` because that
 * variable is commonly set to a docker-internal hostname (e.g.
 * "http://backend:3001") for Next.js SSR fetches, which the browser
 * cannot resolve.
 */
let socket: Socket | null = null;

/** Resolve the websocket base URL at call time, not module load time. */
function resolveBase(): string {
  // Read a dedicated WS env var; ignore NEXT_PUBLIC_API_URL (SSR-only).
  const fromEnv = process.env.NEXT_PUBLIC_WS_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  // Allow runtime override via window for docker-compose style deployments.
  if (typeof window !== 'undefined') {
    const fromWindow = (window as any).__WS_BASE__;
    if (fromWindow) return String(fromWindow).replace(/\/$/, '');
  }
  // Same-origin: socket.io picks up window.location.origin when path is '/'.
  return '';
}

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

  const base = resolveBase();
  const token = getToken() || '';
  // socket.io-client interprets '/namespace' as same-origin and
  // '<absolute>/namespace' as explicit host.
  const url = base ? `${base}/ws/messages` : '/ws/messages';

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
