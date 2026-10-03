/**
 * Discord webhook notifications for the college quiz.
 *
 * The webhook URL is saved in the app config on the device that sets it, and
 * the message is posted from the student's own browser. That means anyone who
 * opens devtools can read the URL and post fake lines, so treat this as a quick
 * "who turned up" log rather than a verified attendance record. Put a proxy in
 * front of the webhook if you ever need it to be tamper proof.
 */

/**
 * Paste your Discord webhook URL here.
 *
 * This constant ships with the app, which is what makes posting work on a
 * student's device: settings saved in the admin panel live in that browser's
 * localStorage only, so without a URL in this file nothing would be posted on
 * someone else's machine. Leave it empty and the app still works, it just
 * stays quiet until a URL is set somewhere.
 */
export const SHARED_WEBHOOK_URL = '';

export const defaultDiscord = {
  webhookUrl: SHARED_WEBHOOK_URL,
  postOnStart: true,
  postOnFinish: true,
};

const EMBED_COLOURS = {
  start: 0x3b82f6,
  finish: 0x10b981,
  test: 0x8b5cf6,
};

const DISCORD_WEBHOOK = /^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//;

export function isDiscordReady(discord) {
  return Boolean(discord && DISCORD_WEBHOOK.test(discord.webhookUrl || ''));
}

function embedFor(event, { name, mode } = {}) {
  const who = (name || 'Someone').trim() || 'Someone';

  if (event === 'test') {
    return {
      title: 'Webhook test',
      description: 'If you can read this in Discord, the connection works.',
      color: EMBED_COLOURS.test,
      timestamp: new Date().toISOString(),
    };
  }

  const finished = event === 'finish';
  return {
    author: { name: who },
    title: finished ? 'Finished the quiz' : 'Started the quiz',
    description: finished
      ? who + ' completed the quiz and confirmed they are coming.'
      : who + ' opened the quiz and entered their name.',
    color: finished ? EMBED_COLOURS.finish : EMBED_COLOURS.start,
    fields: mode ? [{ name: 'Mode', value: mode, inline: true }] : [],
    footer: { text: 'College Quiz' },
    timestamp: new Date().toISOString(),
  };
}

/**
 * Posts one quiz event to Discord. Never throws, so a webhook problem can
 * never block the quiz itself.
 */
export async function sendDiscord(discord, event, details = {}) {
  if (!isDiscordReady(discord)) return { sent: false, reason: 'no-webhook' };
  if (event === 'start' && !discord.postOnStart) return { sent: false, reason: 'disabled' };
  if (event === 'finish' && !discord.postOnFinish) return { sent: false, reason: 'disabled' };

  try {
    const response = await fetch(discord.webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'College Quiz',
        allowed_mentions: { parse: [] },
        embeds: [embedFor(event, details)],
      }),
    });

    if (!response.ok) {
      return { sent: false, reason: 'Discord replied ' + response.status };
    }
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: 'Could not reach Discord, check the URL and your connection' };
  }
}
