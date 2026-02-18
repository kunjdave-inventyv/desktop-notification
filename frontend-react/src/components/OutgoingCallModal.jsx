export default function OutgoingCallModal({ to, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center px-4">
      <div className="bg-gray-900 border border-gray-700 rounded-3xl p-8 w-full max-w-xs text-center animate-fade-in shadow-2xl">
        {/* Pulsing avatar */}
        <div className="relative flex items-center justify-center mb-6">
          <div className="absolute w-24 h-24 rounded-full bg-indigo-500/10 animate-ping" />
          <div className="absolute w-20 h-20 rounded-full bg-indigo-500/20 animate-ring-pulse" />
          <div className="relative w-16 h-16 rounded-full bg-indigo-600 flex items-center justify-center z-10 text-white font-bold text-xl">
            {to[0]?.toUpperCase()}
          </div>
        </div>

        <p className="text-xs font-medium uppercase tracking-widest text-gray-500 mb-1">Calling</p>
        <p className="text-2xl font-bold text-white mb-1">{to}</p>

        <div className="flex items-center justify-center gap-1.5 mb-8">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-indigo-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 0.15}s` }}
            />
          ))}
          <p className="text-sm text-gray-400 ml-1">Ringing</p>
        </div>

        <button
          onClick={onCancel}
          className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl py-3 text-sm transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
          Cancel
        </button>
      </div>
    </div>
  )
}
