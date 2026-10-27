export type PublicationRewards = {
  reason?: 'awarded' | 'limit_reached' | 'duplicate_audio' | 'legacy';
  score: 'recorded' | 'pending';
  points: number | null;
  credits: 'credited' | 'pending' | 'unavailable' | 'not_awarded';
  creditedRg: number | null;
  balanceRg: number | null;
};

export function publicationRewardMessages(rewards?: PublicationRewards) {
  const score = ['limit_reached', 'duplicate_audio'].includes(rewards?.reason || '') ? 'Publicación confirmada; esta canción no suma puntos.' : rewards?.score === 'recorded'
    ? `${rewards.points === null ? 'Puntos' : `${rewards.points} puntos`} registrados en el Top 23.`
    : 'Los puntos están pendientes de confirmación.';
  const credits = rewards?.credits === 'credited' && rewards.creditedRg !== null
    ? `${rewards.creditedRg.toLocaleString('es')} RG acreditados en tu wallet.`
    : rewards?.reason === 'limit_reached' ? 'Ya recibiste los tres premios de este bloque de 12 horas. Tu canción quedó publicada.'
      : rewards?.reason === 'duplicate_audio' ? 'Este mismo audio ya recibió su recompensa. Tu canción quedó publicada.'
      : rewards?.reason === 'legacy' ? 'Esta publicación conserva sus puntos anteriores; no genera un nuevo abono RG.'
    : rewards?.credits === 'unavailable' ? 'Los créditos RG aún no están habilitados.'
      : rewards?.credits === 'not_awarded' ? 'No se confirmó un abono RG para esta publicación.'
        : 'El abono RG está pendiente de confirmación.';
  return { score, credits };
}
