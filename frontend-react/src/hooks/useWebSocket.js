import { useEffect, useRef, useCallback } from 'react'

const WS_URL = 'ws://localhost:3001/ws'

export function useWebSocket(onMessage) {
  const wsRef = useRef(null)
  const onMessageRef = useRef(onMessage)

  useEffect(() => {
    onMessageRef.current = onMessage
  }, [onMessage])

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        onMessageRef.current(data)
      } catch (e) {
        console.error('Failed to parse message:', e)
      }
    }

    ws.onerror = (e) => console.error('WebSocket error:', e)

    return ws
  }, [])

  const send = useCallback((msg) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg))
    }
  }, [])

  const disconnect = useCallback(() => {
    wsRef.current?.close()
  }, [])

  return { connect, send, disconnect, wsRef }
}
