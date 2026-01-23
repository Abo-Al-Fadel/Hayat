// src/hooks/useSignalR.ts
/**
 * SIGNALR HOOK - SHARED SESSION
 * 
 * RULES:
 * - Token from localStorage (shared across all tabs)
 * - Clean disconnect on logout/unmount
 * - Prevent duplicate subscriptions using ref tracking
 * - Use WebSockets with LongPolling fallback
 * 
 * Console logs:
 * - [SignalR] Connected: <connectionId>
 * - [SignalR] Disconnected: <connectionId>
 * - [SignalR] Event received: <eventName> - <payload>
 */
import { useEffect, useRef, useCallback } from "react";
import * as signalR from "@microsoft/signalr";

const API_BASE = process.env.REACT_APP_API_BASE || "http://localhost:5057";

// Storage key - shared across all tabs
const TOKEN_KEY = "token";

// Generate unique connection identifier
const generateConnectionId = () => `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

interface SignalRHandlers {
  [eventName: string]: (payload: any) => void;
}

export function useSignalR(hubPath: string, handlers: SignalRHandlers) {
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const connectionIdRef = useRef<string>(generateConnectionId());
  const isConnectingRef = useRef(false);
  const isSubscribedRef = useRef(false); // Prevent duplicate subscriptions
  const handlersRef = useRef(handlers); // Keep handlers ref stable

  // Update handlers ref on change
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  // Get token from localStorage (shared across all tabs)
  const getToken = useCallback(() => {
    return localStorage.getItem(TOKEN_KEY) || "";
  }, []);

  useEffect(() => {
    let mounted = true;

    const start = async () => {
      // Prevent multiple connection attempts
      if (isConnectingRef.current || isSubscribedRef.current) {
        console.log("[SignalR] Connection already in progress or subscribed, skipping");
        return;
      }
      isConnectingRef.current = true;

      try {
        const token = getToken();
        if (!token) {
          console.warn("[SignalR] No token in localStorage, skipping connection");
          isConnectingRef.current = false;
          return;
        }

        console.log("[SignalR] Creating connection to", `${API_BASE}${hubPath}`);

        const connection = new signalR.HubConnectionBuilder()
          .withUrl(`${API_BASE}${hubPath}`, {
            accessTokenFactory: () => getToken(),
            // Use WebSockets with fallback to LongPolling for cross-port support
            transport: signalR.HttpTransportType.WebSockets | signalR.HttpTransportType.LongPolling,
          })
          .withAutomaticReconnect([0, 2000, 5000, 10000, 30000])
          .configureLogging(signalR.LogLevel.Information)
          .build();

        // Register all handlers with logging wrapper
        Object.entries(handlersRef.current).forEach(([eventName, handler]) => {
          connection.on(eventName, (payload) => {
            console.log(`[SignalR] ============================================`);
            console.log(`[SignalR] EVENT RECEIVED: ${eventName}`);
            console.log(`[SignalR] Payload:`, JSON.stringify(payload, null, 2));
            console.log(`[SignalR] ============================================`);
            handler(payload);
          });
        });

        connection.onclose((err) => {
          console.log(`[SignalR] Disconnected: ${connectionIdRef.current}`);
          isSubscribedRef.current = false;
          if (err) {
            console.warn(`[SignalR] Close error:`, err);
          }
        });

        connection.onreconnecting((err) => {
          console.warn(`[SignalR] Reconnecting: ${connectionIdRef.current}`, err);
        });

        connection.onreconnected((newId) => {
          console.log(`[SignalR] Reconnected: ${connectionIdRef.current} (server: ${newId})`);
        });

        await connection.start();
        
        if (!mounted) {
          connection.stop().catch(() => {});
          isConnectingRef.current = false;
          return;
        }
        
        connectionRef.current = connection;
        isSubscribedRef.current = true;
        console.log(`[SignalR] ✓ Connected: ${connectionIdRef.current}`);
        console.log(`[SignalR] Connection state:`, connection.state);
      } catch (err) {
        console.error(`[SignalR] Connection failed:`, err);
      } finally {
        isConnectingRef.current = false;
      }
    };

    start();

    // Capture ref value for cleanup
    const currentConnectionId = connectionIdRef.current;

    return () => {
      mounted = false;
      isSubscribedRef.current = false;
      if (connectionRef.current) {
        console.log(`[SignalR] Disconnected: ${currentConnectionId}`);
        connectionRef.current.stop().catch(() => {});
        connectionRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hubPath]);

  const invoke = useCallback(async (methodName: string, ...args: any[]) => {
    if (connectionRef.current?.state === signalR.HubConnectionState.Connected) {
      try {
        await connectionRef.current.invoke(methodName, ...args);
        return true;
      } catch (err) {
        console.warn(`[SignalR] Invoke ${methodName} failed:`, err);
        return false;
      }
    }
    return false;
  }, []);

  // Stop connection manually (for logout)
  const stopConnection = useCallback(async () => {
    if (connectionRef.current) {
      console.log(`[SignalR] Disconnected: ${connectionIdRef.current}`);
      await connectionRef.current.stop().catch(() => {});
      connectionRef.current = null;
    }
  }, []);

  return { 
    invoke, 
    connection: connectionRef, 
    connectionId: connectionIdRef.current,
    stopConnection 
  };
}
