// src/hooks/useSignalR.ts
/**
 * SIGNALR HOOK - SINGLETON CONNECTION
 * 
 * ARCHITECTURE:
 * - ONE connection per hubPath (singleton, survives re-renders)
 * - ONE .on() listener per event name (prevents duplicates)
 * - Handlers are stored in a registry and called via the single listener
 * - React StrictMode safe (double-mount doesn't create duplicates)
 * 
 * CRITICAL RULES:
 * 1. Connection is created ONCE and reused by all components
 * 2. Event listeners (.on) are registered ONCE per event name
 * 3. Handler registry is updated on every render to get fresh closures
 * 4. Cleanup decrements refCount but doesn't stop connection
 * 5. Call stopAllSignalRConnections() on logout to fully disconnect
 */
import { useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5057";
const TOKEN_KEY = "token";

// SINGLETON connection store - one connection per hub path
interface ConnectionStore {
  connection: signalR.HubConnection;
  refCount: number;
  registeredEvents: Set<string>;  // Track which .on() listeners are registered
}

const connectionStore = new Map<string, ConnectionStore>();

// Global handler registry - maps hubPath -> eventName -> latest handler
// This allows us to update handlers without re-registering .on() listeners
const handlerRegistry = new Map<string, Map<string, (payload: any) => void>>();

interface SignalRHandlers {
  [eventName: string]: (payload: any) => void;
}

export function useSignalR(hubPath: string, handlers: SignalRHandlers) {
  const handlersRef = useRef(handlers);
  const componentIdRef = useRef(Math.random().toString(36).substring(7));
  const isInitializedRef = useRef(false);

  // Keep handlers ref updated with latest closures
  useEffect(() => {
    handlersRef.current = handlers;
    
    // Update global handler registry with latest handlers
    if (!handlerRegistry.has(hubPath)) {
      handlerRegistry.set(hubPath, new Map());
    }
    const eventHandlers = handlerRegistry.get(hubPath)!;
    Object.entries(handlers).forEach(([eventName, handler]) => {
      eventHandlers.set(eventName, handler);
    });
  }, [hubPath, handlers]);

  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_KEY) || "";
  }, []);

  useEffect(() => {
    // Prevent double initialization in React StrictMode
    if (isInitializedRef.current) {
      console.log(`[SignalR] Component ${componentIdRef.current} already initialized, skipping`);
      return;
    }
    isInitializedRef.current = true;
    
    console.log(`[SignalR] Component ${componentIdRef.current} initializing for ${hubPath}`);

    const initConnection = async () => {
      const token = getToken();
      if (!token) {
        console.warn("[SignalR] No token in localStorage, skipping connection");
        return;
      }

      let store = connectionStore.get(hubPath);

      // CASE 1: Connection exists and is connected - just increment refCount
      if (store && store.connection.state === signalR.HubConnectionState.Connected) {
        console.log(`[SignalR] Reusing existing connection for ${hubPath} (refCount: ${store.refCount + 1})`);
        store.refCount++;
        
        // Register any new events that this component needs
        Object.keys(handlersRef.current).forEach(eventName => {
          if (!store!.registeredEvents.has(eventName)) {
            registerEventListener(store!.connection, hubPath, eventName);
            store!.registeredEvents.add(eventName);
          }
        });
        return;
      }

      // CASE 2: Connection exists but not connected - wait for it or let it reconnect
      if (store && store.connection.state === signalR.HubConnectionState.Connecting) {
        console.log(`[SignalR] Connection is starting, incrementing refCount`);
        store.refCount++;
        return;
      }

      // CASE 3: No connection - create new one
      console.log("[SignalR] ============================================");
      console.log(`[SignalR] Creating NEW connection to ${API_BASE}${hubPath}`);

      const connection = new signalR.HubConnectionBuilder()
        .withUrl(`${API_BASE}${hubPath}`, {
          accessTokenFactory: () => getToken(),
          transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
        })
        .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 30000])
        .configureLogging(signalR.LogLevel.Warning)
        .build();

      store = {
        connection,
        refCount: 1,
        registeredEvents: new Set()
      };
      connectionStore.set(hubPath, store);

      // Initialize handler registry for this hub
      if (!handlerRegistry.has(hubPath)) {
        handlerRegistry.set(hubPath, new Map());
      }

      // Register event listeners for ALL events this component needs
      Object.keys(handlersRef.current).forEach(eventName => {
        registerEventListener(connection, hubPath, eventName);
        store!.registeredEvents.add(eventName);
      });

      connection.onclose((err) => {
        console.log(`[SignalR] Connection closed for ${hubPath}`);
        if (err) console.warn(`[SignalR] Close error:`, err);
      });

      connection.onreconnecting((err) => {
        console.warn(`[SignalR] Reconnecting ${hubPath}...`, err);
      });

      connection.onreconnected((newId) => {
        console.log(`[SignalR] Reconnected ${hubPath} (server: ${newId})`);
      });

      try {
        await connection.start();
        console.log(`[SignalR] Connected to ${hubPath}`);
        console.log(`[SignalR] Connection state: ${connection.state}`);
        console.log("[SignalR] ============================================");
      } catch (err) {
        console.error(`[SignalR] Connection failed for ${hubPath}:`, err);
        connectionStore.delete(hubPath);
      }
    };

    initConnection();

    // Cleanup: decrement refCount but DON'T stop connection
    // Connection persists for better UX; use stopAllSignalRConnections() on logout
    return () => {
      console.log(`[SignalR] Component ${componentIdRef.current} cleanup`);
      const store = connectionStore.get(hubPath);
      if (store) {
        store.refCount = Math.max(0, store.refCount - 1);
        console.log(`[SignalR] RefCount for ${hubPath}: ${store.refCount}`);
      }
      // Reset for potential re-mount (StrictMode)
      isInitializedRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubPath, getToken]);

  const invoke = useCallback(async (methodName: string, ...args: any[]) => {
    const store = connectionStore.get(hubPath);
    if (store?.connection?.state === signalR.HubConnectionState.Connected) {
      try {
        await store.connection.invoke(methodName, ...args);
        return true;
      } catch (err) {
        console.warn(`[SignalR] Invoke ${methodName} failed:`, err);
        return false;
      }
    }
    return false;
  }, [hubPath]);

  const stopConnection = useCallback(async () => {
    const store = connectionStore.get(hubPath);
    if (store?.connection) {
      console.log(`[SignalR] Manually stopping connection for ${hubPath}`);
      await store.connection.stop().catch(() => {});
      connectionStore.delete(hubPath);
      handlerRegistry.delete(hubPath);
    }
  }, [hubPath]);

  return { invoke, stopConnection };
}

/**
 * Register a SINGLE event listener that dispatches to the current handler
 * This function is called ONCE per event name, regardless of re-renders
 */
function registerEventListener(connection: signalR.HubConnection, hubPath: string, eventName: string) {
  console.log(`[SignalR] Registering listener for event: ${eventName}`);
  
  connection.on(eventName, (payload: any) => {
    console.log(`[SignalR] ============================================`);
    console.log(`[SignalR] Event received: ${eventName}`);
    console.log(`[SignalR] Payload:`, JSON.stringify(payload, null, 2));
    console.log(`[SignalR] ============================================`);
    
    // Get the CURRENT handler from registry (always fresh, no stale closures)
    const eventHandlers = handlerRegistry.get(hubPath);
    const handler = eventHandlers?.get(eventName);
    
    if (handler) {
      try {
        handler(payload);
        console.log(`[SignalR] Handler executed for ${eventName}`);
      } catch (err) {
        console.error(`[SignalR] Handler error for ${eventName}:`, err);
      }
    } else {
      console.warn(`[SignalR] No handler registered for ${eventName}`);
    }
  });
}

/**
 * Stop ALL SignalR connections - call this on logout
 */
export function stopAllSignalRConnections() {
  console.log("[SignalR] ============================================");
  console.log("[SignalR] Stopping ALL connections (logout)");
  
  connectionStore.forEach(async (store, hubPath) => {
    try {
      await store.connection.stop();
      console.log(`[SignalR] Stopped connection: ${hubPath}`);
    } catch (err) {
      console.warn(`[SignalR] Error stopping ${hubPath}:`, err);
    }
  });
  
  connectionStore.clear();
  handlerRegistry.clear();
  
  console.log("[SignalR] All connections stopped");
  console.log("[SignalR] ============================================");
}
