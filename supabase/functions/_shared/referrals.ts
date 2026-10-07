// Referral levels: each level needs N new valid invites (counter restarts at 0
// after every achievement). Each achievement = 3 days. After level 3 it repeats.
export const REF_REWARD_DAYS = 3;
export const REF_LEVELS = [
  { level: 1, need: 5 },
  { level: 2, need: 10 },
  { level: 3, need: 20 },
];

/** Progress for `count` valid invites. */
export function progressFor(count: number) {
  let left = count;
  let achieved = 0;
  let idx = 0;
  while (left >= REF_LEVELS[idx].need) {
    left -= REF_LEVELS[idx].need;
    achieved++;
    if (idx < REF_LEVELS.length - 1) idx++;
  }
  const cur = REF_LEVELS[idx];
  return { achieved, level: cur.level, need: cur.need, counter: left };
}

export function rewardFor(count: number): number {
  return progressFor(count).achieved * REF_REWARD_DAYS;
}

/**
 * Recompute referrer reward vs. what was already granted and apply the difference
 * (positive = add days, negative = take back days when an invite gets revoked).
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
  return { total, diff, expiresAt, ...progressFor(total) };
}
