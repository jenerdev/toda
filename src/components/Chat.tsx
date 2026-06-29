import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthProvider'
import { useMessages } from '../hooks/useMessages'

/**
 * In-ride chat between the commuter and the assigned driver.
 * `quickReplies` renders one-tap canned messages above the input (e.g. driver
 * phrases for hands-free messaging while riding).
 */
export function Chat({ rideId, quickReplies }: { rideId: string; quickReplies?: string[] }) {
  const { user } = useAuth()
  const { messages, send } = useMessages(rideId, user?.id)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to the newest message.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendBody(body: string) {
    if (!body.trim() || sending) return
    setSending(true)
    try {
      await send(body)
      setText('')
    } finally {
      setSending(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    await sendBody(text)
  }

  return (
    <div className="rounded-xl border bg-white">
      <div className="border-b px-4 py-2 text-sm font-medium text-gray-600">Chat</div>

      <div className="flex h-48 flex-col gap-2 overflow-y-auto px-3 py-3">
        {messages.length === 0 ? (
          <p className="m-auto text-sm text-gray-400">Say hello 👋</p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === user?.id
            return (
              <div
                key={m.id}
                className={'flex ' + (mine ? 'justify-end' : 'justify-start')}
              >
                <span
                  className={
                    'max-w-[75%] rounded-2xl px-3 py-1.5 text-sm ' +
                    (mine
                      ? 'rounded-br-sm bg-brand text-white'
                      : 'rounded-bl-sm bg-gray-100 text-gray-800')
                  }
                >
                  {m.body}
                </span>
              </div>
            )
          })
        )}
        <div ref={endRef} />
      </div>

      {quickReplies && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t px-2 py-2">
          {quickReplies.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => void sendBody(q)}
              disabled={sending}
              className="rounded-full border border-brand/40 bg-brand/5 px-3 py-1 text-xs font-medium text-brand-dark transition hover:bg-brand/10 disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="flex gap-2 border-t p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          maxLength={1000}
          className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-dark disabled:opacity-60"
        >
          Send
        </button>
      </form>
    </div>
  )
}
