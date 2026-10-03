import { Send } from 'lucide-react';
import { isDiscordReady } from './discord.js';

function Toggle({ checked, onChange, label }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-200 p-3 hover:border-blue-300 transition-colors">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer accent-blue-600"
      />
      <span className="text-sm text-gray-700">{label}</span>
    </label>
  );
}

/** Webhook settings inside the admin panel. */
export default function DiscordPanel({ discord, onChange, onTest, testing }) {
  const ready = isDiscordReady(discord);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        <strong>Keep this in mind:</strong> the message is sent from the student's own browser, so
        the webhook URL is readable in devtools and anyone could post fake lines. It is a handy
        log of who turned up, not a verified attendance record.
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Discord webhook URL</label>
        <input
          type="password"
          value={discord.webhookUrl}
          onChange={(e) => onChange({ ...discord, webhookUrl: e.target.value.trim() })}
          placeholder="https://discord.com/api/webhooks/..."
          autoComplete="off"
          className="w-full rounded-lg border px-3 py-2 font-mono text-sm focus:ring-2 focus:ring-blue-500"
        />
        <p className="mt-1 text-xs text-gray-500">
          In Discord: Server Settings, Integrations, Webhooks, New Webhook, Copy URL.
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Saving here keeps the URL on <strong>this</strong> device only, which is handy for
          testing. To make it work on every student's copy, put the same URL in
          <code>SHARED_WEBHOOK_URL</code> in <code>src/discord.js</code>.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Toggle
          checked={discord.postOnStart}
          onChange={(postOnStart) => onChange({ ...discord, postOnStart })}
          label="Post when a student starts"
        />
        <Toggle
          checked={discord.postOnFinish}
          onChange={(postOnFinish) => onChange({ ...discord, postOnFinish })}
          label="Post when a student finishes"
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={onTest}
          disabled={testing || !ready}
          className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 font-medium text-white transition-colors hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={18} />
          {testing ? 'Sending...' : 'Send test message'}
        </button>
        <span className={'text-sm ' + (ready ? 'text-green-600' : 'text-gray-500')}>
          {ready ? 'Webhook URL looks valid' : 'Paste a webhook URL to enable posting'}
        </span>
      </div>
    </div>
  );
}
