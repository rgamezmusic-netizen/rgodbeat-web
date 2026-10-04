import "server-only";

export function youtubeConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.YOUTUBE_REDIRECT_URI?.trim();
  const encryptionKey = process.env.YOUTUBE_TOKEN_ENCRYPTION_KEY?.trim();
  const adminEmail = process.env.YOUTUBE_CHANNEL_ADMIN_EMAIL?.trim().toLowerCase();
  const channelId = process.env.YOUTUBE_CHANNEL_ID?.trim();
  const configured = Boolean(clientId && clientSecret && redirectUri && encryptionKey && adminEmail && channelId);
  const validKey = Boolean(encryptionKey && /^[a-f0-9]{64}$/i.test(encryptionKey));

  return { clientId, clientSecret, redirectUri, encryptionKey, adminEmail, channelId, configured, validKey };
}

export function isYouTubeChannelAdmin(email: string | null | undefined): boolean {
  const configuredEmail = youtubeConfig().adminEmail;
  return Boolean(email && configuredEmail && email.toLowerCase() === configuredEmail);
}
