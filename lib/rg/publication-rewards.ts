export type PublicationRewards = {
  score: 'recorded' | 'pending';
  points: number | null;
  credits: 'credited' | 'pending' | 'unavailable' | 'not_awarded';
  creditedRg: number | null;
  balanceRg: number | null;
};

export function publicationRewardMessages(rewards?: PublicationRewards) {
  const score = rewards?.score === 'recorded'
    ? `${rewards.points === null ? 'Puntos' : `${rewards.points} puntos`} registrados en el Top 23.`
    : 'Los puntos están pendientes de confirmación.';
  const credits = rewards?.credits === 'credited' && rewards.creditedRg !== null
    ? `${rewards.creditedRg.toLocaleString('es')} RG acreditados en tu wallet.`
    : rewards?.credits === 'unavailable' ? 'Los créditos RG aún no están habilitados.'
      : rewards?.credits === 'not_awarded' ? 'No se confirmó un abono RG para esta publicación.'
        : 'El abono RG está pendiente de confirmación.';
  return { score, credits };
}
