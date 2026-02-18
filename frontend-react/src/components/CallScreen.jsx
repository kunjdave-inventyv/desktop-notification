// import { useState, useEffect, useCallback, useRef } from 'react'
// import { useWebSocket } from '../hooks/useWebSocket'
// import IncomingCallModal from './IncomingCallModal'
// import OutgoingCallModal from './OutgoingCallModal'

// export default function CallScreen({ userId, peerId, onDisconnect }) {
//   const [peerOnline, setPeerOnline] = useState(false)
//   const [callState, setCallState] = useState('idle') // idle | calling | incoming | accepted | rejected
//   const [incomingFrom, setIncomingFrom] = useState(null)
//   const [statusMessage, setStatusMessage] = useState('')

//   const flashTimeout = useRef(null)

//   const flash = (msg) => {
//     setStatusMessage(msg)
//     clearTimeout(flashTimeout.current)
//     flashTimeout.current = setTimeout(() => setStatusMessage(''), 3500)
//   }

//   const handleMessage = useCallback((msg) => {
//     switch (msg.type) {
//       case 'Registered':
//         // After we register, ask server who is online by sending a presence check.
//         // The server will broadcast UserOnline for anyone already connected,
//         // so we just need to also treat our own Registered as a trigger to re-check.
//         // Nothing extra needed here — handled by PeerOnlineAck below.
//         break

//       case 'PeerOnlineAck':
//         // Server confirms peer is already online at the time we registered
//         if (msg.payload.user_id === peerId) {
//           setPeerOnline(true)
//         }
//         break

//       case 'UserOnline':
//         if (msg.payload.user_id === peerId) {
//           setPeerOnline(true)
//           flash(`${peerId} came online`)
//         }
//         break

//       case 'UserOffline':
//         if (msg.payload.user_id === peerId) {
//           setPeerOnline(false)
//           setCallState('idle')
//           flash(`${peerId} went offline`)
//         }
//         break

//       case 'IncomingCall':
//         setIncomingFrom(msg.payload.from)
//         setCallState('incoming')
//         break

//       case 'CallAccepted':
//         setCallState('accepted')
//         flash(`${msg.payload.by} accepted your call!`)
//         break

//       case 'CallRejected':
//         setCallState('rejected')
//         flash(`${msg.payload.by} rejected your call.`)
//         setTimeout(() => setCallState('idle'), 3000)
//         break

//       case 'Error':
//         flash(`Error: ${msg.payload.message}`)
//         setCallState('idle')
//         break

//       default:
//         break
//     }
//   }, [peerId])

//   const { connect, send, disconnect, wsRef } = useWebSocket(handleMessage)

//   useEffect(() => {
//     const ws = connect()

//     ws.onopen = () => {
//       send({ type: 'Register', payload: { user_id: userId } })
//     }

//     ws.onclose = () => {
//       setPeerOnline(false)
//     }

//     return () => {
//       disconnect()
//     }
//   }, [connect, disconnect, send, userId])

//   const handleCall = () => {
//     if (!peerOnline) return
//     setCallState('calling')
//     send({ type: 'Call', payload: { from: userId, to: peerId } })
//   }

//   const handleAccept = () => {
//     send({ type: 'Accept', payload: { from: userId, to: incomingFrom } })
//     setCallState('accepted')
//   }

//   const handleReject = () => {
//     send({ type: 'Reject', payload: { from: userId, to: incomingFrom } })
//     setIncomingFrom(null)
//     setCallState('idle')
//   }

//   const handleEndCall = () => {
//     setCallState('idle')
//   }

//   const handleCancelCall = () => {
//     setCallState('idle')
//   }

//   const wsConnected = wsRef.current?.readyState === WebSocket.OPEN

//   return (
//     <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
//       {/* Incoming call modal */}
//       {callState === 'incoming' && (
//         <IncomingCallModal
//           from={incomingFrom}
//           onAccept={handleAccept}
//           onReject={handleReject}
//         />
//       )}

//       {/* Outgoing call modal */}
//       {callState === 'calling' && (
//         <OutgoingCallModal
//           to={peerId}
//           onCancel={handleCancelCall}
//         />
//       )}

//       <div className="w-full max-w-sm space-y-4 animate-fade-in">
//         {/* Header */}
//         <div className="flex items-center justify-between mb-2">
//           <div>
//             <h1 className="text-lg font-bold text-white">Signal</h1>
//             <p className="text-xs text-gray-500">WebSocket P2P Call</p>
//           </div>
//           <button
//             onClick={onDisconnect}
//             className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
//           >
//             ← Back
//           </button>
//         </div>

//         {/* Your info card */}
//         <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
//           <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Your Session</p>
//           <div className="flex items-center gap-3">
//             <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
//               {userId[0]?.toUpperCase()}
//             </div>
//             <div>
//               <p className="font-semibold text-white text-sm">{userId}</p>
//               <div className="flex items-center gap-1.5 mt-0.5">
//                 <span className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
//                 <span className="text-xs text-gray-500">
//                   {wsConnected ? 'Connected to server' : 'Connecting...'}
//                 </span>
//               </div>
//             </div>
//           </div>
//         </div>

//         {/* Peer card */}
//         <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
//           <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Peer</p>
//           <div className="flex items-center gap-3">
//             <div className="relative flex-shrink-0">
//               <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
//                 {peerId[0]?.toUpperCase()}
//               </div>
//               <span
//                 className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${peerOnline ? 'bg-green-400' : 'bg-gray-600'}`}
//               />
//             </div>
//             <div>
//               <p className="font-semibold text-white text-sm">{peerId}</p>
//               <p className={`text-xs mt-0.5 ${peerOnline ? 'text-green-400' : 'text-gray-500'}`}>
//                 {peerOnline ? 'Online' : 'Offline — waiting for them to connect'}
//               </p>
//             </div>
//           </div>
//         </div>

//         {/* Call button / status */}
//         {callState === 'idle' && (
//           <button
//             onClick={handleCall}
//             disabled={!peerOnline}
//             className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors"
//           >
//             <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
//               <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
//             </svg>
//             {peerOnline ? `Call ${peerId}` : `Waiting for ${peerId}...`}
//           </button>
//         )}

//         {callState === 'accepted' && (
//           <div className="space-y-3">
//             <div className="bg-green-900/30 border border-green-700/50 rounded-2xl p-4 text-center">
//               <div className="flex items-center justify-center gap-2 text-green-400 font-semibold text-sm">
//                 <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
//                 Call connected with {callState === 'accepted' && peerId}
//               </div>
//               <p className="text-xs text-gray-500 mt-1">Audio call simulation active</p>
//             </div>
//             <button
//               onClick={handleEndCall}
//               className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors"
//             >
//               <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
//                 <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
//               </svg>
//               End Call
//             </button>
//           </div>
//         )}

//         {callState === 'rejected' && (
//           <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
//             <p className="text-red-400 text-sm font-medium">Call was rejected</p>
//           </div>
//         )}

//         {/* Status flash */}
//         {statusMessage && (
//           <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-center animate-fade-in">
//             <p className="text-xs text-gray-300">{statusMessage}</p>
//           </div>
//         )}
//       </div>
//     </div>
//   )
// }
import { useState, useEffect, useCallback, useRef } from 'react'
import { useWebSocket } from '../hooks/useWebSocket'
import { registerPushSubscription, onSwMessage } from '../hooks/usePushSubscription'
import IncomingCallModal from './IncomingCallModal'
import OutgoingCallModal from './OutgoingCallModal'

export default function CallScreen({ userId, peerId, autoAction, onDisconnect }) {
  const [peerOnline, setPeerOnline]   = useState(false)
  const [callState, setCallState]     = useState('idle')
  const [incomingFrom, setIncomingFrom] = useState(null)
  const [statusMessage, setStatusMessage] = useState('')
  const [pushReady, setPushReady]     = useState(false)

  const registeredRef = useRef(false)
  const flashTimeout  = useRef(null)
  const sendRef       = useRef(null)  // stable ref to send so SW handler can use it

  const flash = (msg) => {
    setStatusMessage(msg)
    clearTimeout(flashTimeout.current)
    flashTimeout.current = setTimeout(() => setStatusMessage(''), 3500)
  }

  const handleMessage = useCallback((msg) => {
    switch (msg.type) {
      case 'Registered':
        registeredRef.current = true
        // Subscribe to push after successful registration
        registerPushSubscription(userId, (m) => sendRef.current?.(m))
          .then(() => setPushReady(true))
          .catch(console.error)
        break

      case 'UserOnline':
        if (msg.payload.user_id === peerId) {
          setPeerOnline(true)
          if (registeredRef.current) flash(`${peerId} came online`)
        }
        break

      case 'UserOffline':
        if (msg.payload.user_id === peerId) {
          setPeerOnline(false)
          setCallState('idle')
          flash(`${peerId} went offline`)
        }
        break

      case 'IncomingCall':
        setIncomingFrom(msg.payload.from)
        setCallState('incoming')
        break

      case 'CallAccepted':
        setCallState('accepted')
        flash(`${msg.payload.by} accepted your call!`)
        break

      case 'CallRejected':
        setCallState('rejected')
        flash(`${msg.payload.by} rejected your call.`)
        setTimeout(() => setCallState('idle'), 3000)
        break

      case 'Error':
        flash(`Error: ${msg.payload.message}`)
        setCallState('idle')
        break

      default:
        break
    }
  }, [peerId, userId])

  const { connect, send, disconnect, wsRef } = useWebSocket(handleMessage)

  // Keep sendRef in sync
  useEffect(() => { sendRef.current = send }, [send])

  useEffect(() => {
    const ws = connect()

    ws.onopen = () => {
      send({ type: 'Register', payload: { user_id: userId } })
    }

    ws.onclose = () => {
      setPeerOnline(false)
      registeredRef.current = false
    }

    return () => disconnect()
  }, [connect, disconnect, send, userId])

  // Listen for messages from service worker (notification accept while tab was open)
  useEffect(() => {
    onSwMessage((data) => {
      if (data.type === 'CALL_ACCEPT_FROM_NOTIFICATION') {
        setIncomingFrom(data.from)
        setCallState('incoming')
      }
    })
  }, [])

  // Auto-accept if opened from a push notification click
  useEffect(() => {
    if (autoAction === 'accept' && registeredRef.current) {
      setIncomingFrom(peerId)
      setCallState('incoming')
    }
  }, [autoAction, peerId])

  // Watch for registration completing then auto-accept
  const handleMessage2 = useCallback((msg) => {
    if (msg.type === 'Registered' && autoAction === 'accept') {
      setTimeout(() => {
        setIncomingFrom(peerId)
        setCallState('incoming')
      }, 500)
    }
  }, [autoAction, peerId])

  const handleCall = () => {
    setCallState('calling')
    send({ type: 'Call', payload: { from: userId, to: peerId } })
  }

  const handleAccept = () => {
    send({ type: 'Accept', payload: { from: userId, to: incomingFrom } })
    setCallState('accepted')
  }

  const handleReject = () => {
    send({ type: 'Reject', payload: { from: userId, to: incomingFrom } })
    setIncomingFrom(null)
    setCallState('idle')
  }

  const handleEndCall    = () => setCallState('idle')
  const handleCancelCall = () => setCallState('idle')

  const wsConnected = wsRef.current?.readyState === WebSocket.OPEN

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
      {callState === 'incoming' && (
        <IncomingCallModal
          from={incomingFrom}
          onAccept={handleAccept}
          onReject={handleReject}
        />
      )}
      {callState === 'calling' && (
        <OutgoingCallModal to={peerId} onCancel={handleCancelCall} />
      )}

      <div className="w-full max-w-sm space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div>
            <h1 className="text-lg font-bold text-white">Signal</h1>
            <p className="text-xs text-gray-500">WebSocket P2P Call</p>
          </div>
          <button onClick={onDisconnect} className="text-xs text-gray-500 hover:text-gray-300 transition-colors">
            ← Back
          </button>
        </div>

        {/* Your session */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Your Session</p>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {userId[0]?.toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{userId}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${wsConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                <span className="text-xs text-gray-500">{wsConnected ? 'Connected to server' : 'Connecting...'}</span>
              </div>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pushReady ? 'bg-blue-400' : 'bg-gray-600'}`} />
                <span className="text-xs text-gray-500">{pushReady ? 'Push notifications active' : 'Setting up push...'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Peer */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
          <p className="text-xs font-medium text-gray-500 mb-3 uppercase tracking-wider">Peer</p>
          <div className="flex items-center gap-3">
            <div className="relative flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-white font-bold text-sm">
                {peerId[0]?.toUpperCase()}
              </div>
              <span className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-gray-900 ${peerOnline ? 'bg-green-400' : 'bg-gray-600'}`} />
            </div>
            <div>
              <p className="font-semibold text-white text-sm">{peerId}</p>
              <p className={`text-xs mt-0.5 ${peerOnline ? 'text-green-400' : 'text-gray-500'}`}>
                {peerOnline ? 'Online' : 'Offline — waiting for them to connect'}
              </p>
            </div>
          </div>
        </div>

        {/* Call button */}
        {callState === 'idle' && (
          <button
            onClick={handleCall}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
            </svg>
            {peerOnline ? `Call ${peerId}` : `Call ${peerId} (offline — will notify)`}
          </button>
        )}

        {callState === 'accepted' && (
          <div className="space-y-3">
            <div className="bg-green-900/30 border border-green-700/50 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2 text-green-400 font-semibold text-sm">
                <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                Call connected with {peerId}
              </div>
              <p className="text-xs text-gray-500 mt-1">Audio call simulation active</p>
            </div>
            <button
              onClick={handleEndCall}
              className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-2xl py-3.5 text-sm transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 8l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M5 3a2 2 0 00-2 2v1c0 8.284 6.716 15 15 15h1a2 2 0 002-2v-3.28a1 1 0 00-.684-.948l-4.493-1.498a1 1 0 00-1.21.502l-1.13 2.257a11.042 11.042 0 01-5.516-5.517l2.257-1.128a1 1 0 00.502-1.21L9.228 3.683A1 1 0 008.279 3H5z" />
              </svg>
              End Call
            </button>
          </div>
        )}

        {callState === 'rejected' && (
          <div className="bg-red-900/20 border border-red-800/50 rounded-2xl p-4 text-center">
            <p className="text-red-400 text-sm font-medium">Call was rejected</p>
          </div>
        )}

        {statusMessage && (
          <div className="bg-gray-900 border border-gray-700 rounded-xl px-4 py-2.5 text-center animate-fade-in">
            <p className="text-xs text-gray-300">{statusMessage}</p>
          </div>
        )}
      </div>
    </div>
  )
}