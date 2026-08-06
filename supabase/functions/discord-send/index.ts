// supabase/functions/discord-send/index.ts
// 디스코드 웹훅 발송 (Edge Function, Deno). 웹훅 URL은 서버(service role)에서만 접근 → 클라이언트 노출 방지.
//
// ⚠️ 이미지 PNG(영수증)는 Edge(Deno)에서 Chromium/Puppeteer 불가.
//    MVP: 아래처럼 디스코드 embed(리치 텍스트)로 발송. PNG는 나중에 외부 렌더 API로.
//
// 배포:   supabase functions deploy discord-send
// 호출:   supabase.functions.invoke('discord-send', { body: { guildId, raidId } })
//
// 권한: config.toml 의 verify_jwt=true 가 익명 호출을 막지만, 그것만으로는
//       "인증된 아무 사용자"까지만 걸러진다. guildId/raidId 만 알면 남의 길드 웹훅으로
//       영수증을 쏠 수 있으므로 소속 검사가 반드시 필요하다.
//       확정(정산 생성)은 길드원 누구나 할 수 있으므로(0008) 발송도 길드원이면 허용한다 —
//       역할까지 요구하면 자기가 확정한 건을 재발송하지 못하는 모순이 생긴다.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const { guildId, raidId } = await req.json();
    if (!guildId || !raidId) {
      return json({ ok: false, error: 'guildId 와 raidId 가 필요합니다.' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // service role → RLS 우회
    );

    // ── 1) 요청자 확인 ──
    // 헤더의 JWT 로 사용자를 특정한다. service role 클라이언트로 검증하는 이유는
    // 아래 소속 조회까지 RLS 를 우회해 확실하게 판정하기 위함이다.
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) return json({ ok: false, error: '인증이 필요합니다.' }, 401);

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    const userId = userData?.user?.id;
    if (userErr || !userId) return json({ ok: false, error: '인증이 필요합니다.' }, 401);

    // ── 2) 길드 소속 확인 ──
    const { data: account } = await supabase
      .from('guild_accounts')
      .select('user_id')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .maybeSingle();
    if (!account) {
      return json({ ok: false, error: '이 길드의 영수증을 발송할 권한이 없습니다.' }, 403);
    }

    // ── 3) 발송 대상 조회 ──
    const { data: guild } = await supabase
      .from('guilds')
      .select('webhook_url')
      .eq('id', guildId)
      .single();
    // raid 도 같은 길드 것인지 확인한다. 소속 검사를 통과했더라도 남의 길드 raidId 를
    // 자기 guildId 와 섞어 보내면 그 내용이 자기 채널로 새어 나온다.
    const { data: raid } = await supabase
      .from('raids')
      .select('*')
      .eq('id', raidId)
      .eq('guild_id', guildId)
      .maybeSingle();

    if (!raid) return json({ ok: false, error: '레이드를 찾을 수 없습니다.' }, 404);
    if (!guild?.webhook_url) {
      return json({ ok: false, error: '디스코드 웹훅이 설정되지 않았습니다.' }, 404);
    }

    // ── 4) 발송 ──
    const meso = (n: number) => Number(n ?? 0).toLocaleString('ko-KR');
    const res = await fetch(guild.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '정산봇',
        embeds: [
          {
            title: `${raid.boss_name} 레이드 정산`,
            color: 0xf97316,
            fields: [
              { name: '총 순수익', value: `${meso(raid.net_profit)} 메소`, inline: true },
              { name: '1인당', value: `${meso(raid.per_person)} 메소`, inline: true },
              { name: '참여', value: `${raid.participant_count}명`, inline: true },
              // 안 쓰는 길드가 대부분이라 0 이면 줄을 만들지 않는다
              ...(raid.sale_incentive_total > 0
                ? [
                    {
                      name: '판매 인센티브',
                      value: `${meso(raid.sale_incentive_total)} 메소 (판매자 몫 · n빵 전 선차감)`,
                      inline: false,
                    },
                  ]
                : []),
              ...(raid.subsidy_total > 0
                ? [
                    {
                      name: '역할 지원금',
                      value: `${meso(raid.subsidy_total)} 메소 (n빵 전 선지급)`,
                      inline: false,
                    },
                  ]
                : []),
            ],
            // 재발송이면 같은 내용이 채널에 여러 번 뜬다. 몇 번째인지 남겨
            // 보는 사람이 "정산이 바뀐 건가" 하고 헷갈리지 않게 한다.
            footer: {
              text:
                raid.send_count > 0
                  ? `메월드 길드 정산 매니저 · 재발송 ${raid.send_count}회차`
                  : '메월드 길드 정산 매니저',
            },
          },
        ],
      }),
    });

    if (!res.ok) {
      // 디스코드가 거절한 이유(웹훅 삭제됨·레이트리밋 등)를 그대로 올려 보낸다.
      return json({ ok: false, error: `디스코드 응답 ${res.status}`, status: res.status });
    }

    // 발송 기록. sent 는 마지막 발송 성공 여부, send_count 는 누적이라 축이 다르다.
    await supabase
      .from('raids')
      .update({
        sent: true,
        sent_at: new Date().toISOString(),
        send_count: (raid.send_count ?? 0) + 1,
      })
      .eq('id', raidId);

    return json({ ok: true, status: res.status });
  } catch (e) {
    return json({ ok: false, error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
