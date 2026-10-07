// Referral levels: reward days per completed block of 5 valid invites.
export const REF_EVERY = 5;
export const REF_LEVELS = [
  { level: 1, from: 0, days: 3 },
  { level: 2, from: 15, days: 5 },
  { level: 3, from: 40, days: 7 },
];

export function levelFor(count: number) {
  let cur = REF_LEVELS[0];
  for (const l of REF_LEVELS) if (count >= l.from) cur = l;
  return cur;
}

/** Total reward days earned for `count` valid invites. */
export function rewardFor(count: number): number {
  let total = 0;
  for (let end = REF_EVERY; end <= count; end += REF_EVERY) total += levelFor(end).days;
  return total;
}

/**
 * Recompute referrer reward vs. what was already granted and apply the difference
 * (positive = add days, negative = take back days previously granted).
 */
export async function syncReferrerReward(
  sb: any, ownerId: string, botTokenId: string, referrerId: number,
  adjustDays: (days: number) => Promise<string | null>,
) {
  const { count } = await sb.from("bot_referrals").select("id", { count: "exact", head: true })
    .eq("bot_token_id", botTokenId).eq("referrer_telegram_id", referrerId).neq("status", "revoked");
  const total = count ?? 0;
  const { data: stat } = await sb.from("bot_referrer_stats").select("rewarded_days")
    .eq("bot_token_id", botTokenId).eq("referrer_telegram_id", referrerId).maybeSingle();
  const already = stat?.rewarded_days ?? 0;
  const target = rewardFor(total);
  const diff = target - already;
  let expiresAt: string | null = null;
  if (diff !== 0) {
    expiresAt = await adjustDays(diff);
    await sb.from("bot_referrer_stats").upsert({
      bot_token_id: botTokenId, owner_id: ownerId, referrer_telegram_id: referrerId,
      rewarded_days: target, updated_at: new Date().toISOString(),
    }, { onConflict: "bot_token_id,referrer_telegram_id" });
  }
  return { total, diff, expiresAt, level: levelFor(total) };
}
