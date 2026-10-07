// Multi-level referral tree.
// Level 1 = people I invited directly, Level 2 = invited by my L1, Level 3 = invited by my L2.
// Each level has its own counter: every `need` valid invites in that level = 3 days.
export const REF_REWARD_DAYS = 3;
export const REF_PENDING_HOURS = 12;
export const REF_LEVELS = [
  { level: 1, need: 5 },
  { level: 2, need: 10 },
  { level: 3, need: 20 },
];

async function referredBy(sb: any, botTokenId: string, ids: number[]): Promise<number[]> {
  if (ids.length === 0) return [];
  const out: number[] = [];
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await sb.from("bot_referrals").select("referred_telegram_id")
      .eq("bot_token_id", botTokenId).neq("status", "revoked").in("referrer_telegram_id", ids.slice(i, i + 500));
    for (const r of data || []) out.push(Number(r.referred_telegram_id));
  }
  return out;
}

/** Per-bot level sizes (editable from the website), falling back to defaults. */
export async function getLevelNeeds(sb: any, botTokenId: string): Promise<number[]> {
  const { data } = await sb.from("bot_tokens").select("ref_level1_need, ref_level2_need, ref_level3_need").eq("id", botTokenId).maybeSingle();
  return [data?.ref_level1_need, data?.ref_level2_need, data?.ref_level3_need]
    .map((v, i) => (Number(v) >= 1 ? Number(v) : REF_LEVELS[i].need));
}

/** Valid invite counts per level for a referrer. */
export async function levelCounts(sb: any, botTokenId: string, referrerId: number) {
  const needs = await getLevelNeeds(sb, botTokenId);
  const counts: number[] = [];
  let frontier = [referrerId];
  for (let i = 0; i < REF_LEVELS.length; i++) {
    frontier = await referredBy(sb, botTokenId, frontier);
    counts.push(frontier.length);
  }
  return REF_LEVELS.map((l, i) => ({
    level: l.level, need: needs[i], count: counts[i],
    achieved: Math.floor(counts[i] / needs[i]), counter: counts[i] % needs[i],
  }));
}

/** Up to 3 ancestors of a user: [L1 referrer, L2, L3]. */
export async function uplineOf(sb: any, botTokenId: string, userId: number): Promise<number[]> {
  const chain: number[] = [];
  let cur = userId;
  for (let i = 0; i < REF_LEVELS.length; i++) {
    const { data } = await sb.from("bot_referrals").select("referrer_telegram_id")
      .eq("bot_token_id", botTokenId).eq("referred_telegram_id", cur).neq("status", "revoked").maybeSingle();
    if (!data) break;
    cur = Number(data.referrer_telegram_id);
    if (chain.includes(cur)) break;
    chain.push(cur);
  }
  return chain;
}

/**
 * Recompute total reward vs. what was already granted and apply the difference
 * (positive = add days, negative = take back days when an invite gets revoked).
 */
export async function syncReferrerReward(
  sb: any, ownerId: string, botTokenId: string, referrerId: number,
  adjustDays: (days: number) => Promise<string | null>,
) {
  const levels = await levelCounts(sb, botTokenId, referrerId);
  const target = levels.reduce((s, l) => s + l.achieved, 0) * REF_REWARD_DAYS;
  const { data: stat } = await sb.from("bot_referrer_stats").select("rewarded_days")
    .eq("bot_token_id", botTokenId).eq("referrer_telegram_id", referrerId).maybeSingle();
  const diff = target - (stat?.rewarded_days ?? 0);
  let expiresAt: string | null = null;
  if (diff !== 0) {
    expiresAt = await adjustDays(diff);
    await sb.from("bot_referrer_stats").upsert({
      bot_token_id: botTokenId, owner_id: ownerId, referrer_telegram_id: referrerId,
      rewarded_days: target, updated_at: new Date().toISOString(),
    }, { onConflict: "bot_token_id,referrer_telegram_id" });
  }
  return { diff, expiresAt, levels };
}

export function timeLeft(createdAt: string): string {
  const ms = new Date(createdAt).getTime() + REF_PENDING_HOURS * 3600000 - Date.now();
  if (ms <= 0) return "انتهت المهلة (بانتظار الفحص)";
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000);
  return `${h}س ${m}د`;
}
