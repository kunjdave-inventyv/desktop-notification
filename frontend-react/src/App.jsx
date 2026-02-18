import { useState } from 'react'
import RegisterScreen from './components/RegisterScreen'
import CallScreen from './components/CallScreen'

export default function App() {
  const [session, setSession] = useState(null) // { userId, peerId }

  const handleRegister = (userId, peerId) => {
    setSession({ userId, peerId })
  }

  const handleDisconnect = () => {
    setSession(null)
  }

  if (!session) {
    return <RegisterScreen onRegister={handleRegister} />
  }

  return (
    <CallScreen
      userId={session.userId}
      peerId={session.peerId}
      onDisconnect={handleDisconnect}
    />
  )
}
