// supabase/functions/discord-send/index.ts
// 디스코드 웹훅 발송 (Edge Function, Deno). 웹훅 URL은 서버(service role)에서만 접근 → 클라이언트 노출 방지.
//
// ⚠️ 이미지 PNG(영수증)는 Edge(Deno)에서 Chromium/Puppeteer 불가.
//    MVP: 아래처럼 디스코드 embed(리치 텍스트)로 발송. PNG는 나중에 외부 렌더 API로.
//
// 배포:   supabase functions deploy discord-send
// 호출:   supabase.functions.invoke('discord-send', { body: { guildId, raidId } })
// TODO(BE): 요청자가 해당 길드 OWNER/ADMIN 인지 검증 후 발송.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (req: Request) => {
  try {
    const { guildId, raidId } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', // service role → RLS 우회
    );

    const { data: guild } = await supabase
      .from('guilds')
      .select('webhook_url')
      .eq('id', guildId)
      .single();
    const { data: raid } = await supabase.from('raids').select('*').eq('id', raidId).single();

    if (!guild?.webhook_url || !raid) {
      return json({ ok: false, error: 'not found' }, 404);
    }

    const meso = (n: number) => Number(n).toLocaleString('ko-KR');
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
            ],
            footer: { text: '메월드 길드 정산 매니저' },
          },
        ],
      }),
    });

    // TODO(BE): raids.sent 업데이트. 발송 실패 시 [유료화 시] credit_logs reason='rollback'.
    return json({ ok: res.ok, status: res.status });
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
