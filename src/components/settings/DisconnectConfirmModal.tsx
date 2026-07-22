'use client'

interface Props {
  serviceName: string
  onCancel: () => void
  onConfirm: () => void
  confirming: boolean
}

export function DisconnectConfirmModal({ serviceName, onCancel, onConfirm, confirming }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">
        <h2 className="text-center text-lg font-semibold text-gray-900">Disconnect {serviceName}?</h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          This stops syncing with {serviceName} right away. It does not delete time entries you&apos;ve
          already created from past syncs — those stay in your account.
        </p>
        <p className="mt-3 text-center text-xs text-gray-500">
          Want that data gone too?{' '}
          <a href="/settings#account" className="underline text-[#3f7c85]">Delete your data</a> from Account settings.
        </p>
        <div className="mt-6 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={confirming}
            className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-60 transition-colors"
          >
            {confirming ? 'Disconnecting…' : 'Yes, disconnect'}
          </button>
        </div>
      </div>
    </div>
  )
}
