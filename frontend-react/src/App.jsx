// import { useState } from 'react'
// import RegisterScreen from './components/RegisterScreen'
// import CallScreen from './components/CallScreen'

// export default function App() {
//   const [session, setSession] = useState(null) // { userId, peerId }

//   const handleRegister = (userId, peerId) => {
//     setSession({ userId, peerId })
//   }

//   const handleDisconnect = () => {
//     setSession(null)
//   }

//   if (!session) {
//     return <RegisterScreen onRegister={handleRegister} />
//   }

//   return (
//     <CallScreen
//       userId={session.userId}
//       peerId={session.peerId}
//       onDisconnect={handleDisconnect}
//     />
//   )
// }

import { useState, useEffect } from 'react'
import RegisterScreen from './components/RegisterScreen'
import CallScreen from './components/CallScreen'

export default function App() {
  const [session, setSession] = useState(null)

  // If opened from a push notification accept click, auto-populate session
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const userId = params.get('userId')
    const peerId = params.get('peerId')
    const action = params.get('action')
    if (userId && peerId) {
      setSession({ userId, peerId, autoAction: action || null })
    }
  }, [])

  const handleRegister = (userId, peerId) => {
    setSession({ userId, peerId, autoAction: null })
  }

  const handleDisconnect = () => {
    setSession(null)
    // Clean up URL params
    window.history.replaceState({}, '', '/')
  }

  if (!session) {
    return <RegisterScreen onRegister={handleRegister} />
  }

  return (
    <CallScreen
      userId={session.userId}
      peerId={session.peerId}
      autoAction={session.autoAction}
      onDisconnect={handleDisconnect}
    />
  )
}