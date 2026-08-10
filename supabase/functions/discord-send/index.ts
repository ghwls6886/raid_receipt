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

// CORS. functions.invoke 는 Authorization 과 Content-Type: application/json 을 실어서
// 브라우저가 반드시 OPTIONS preflight 를 먼저 보낸다. 그걸 받아 주지 않으면 본 요청이
// 아예 나가지 않는다 — 이 함수가 브라우저에서 한 번도 성공하지 못한 이유다.
//
// Origin 을 '*' 로 두는 이유: 토큰은 localStorage 라 오리진 밖에서 못 읽고, 쿠키를 쓰지
// 않아 credentials 도 필요 없다. 남의 사이트가 이 URL 을 불러도 유효한 JWT 가 없으면
// 아래 1)에서 401 이고, 있어도 2) 소속 검사에서 걸린다. 도메인이 아직 안 정해졌고
// 프리뷰 배포마다 오리진이 바뀌므로 목록으로 묶으면 조용히 깨진다.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

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
      // code 를 같이 준다. 화면이 이 경우만 "설정하러 갈까요?" 로 안내하려면
      // 메시지 문자열 비교밖에 방법이 없는데, 문구를 고치는 순간 조용히 깨진다.
      return json(
        { ok: false, code: 'WEBHOOK_MISSING', error: '디스코드 웹훅이 설정되지 않았습니다.' },
        404,
      );
    }

    // 참여자별 내역. 닉네임은 members 임베드로 가져오고, 용병은 guest_name 을 쓴다.
    // 실패해도 요약만으로 발송한다 — 영수증이 아예 안 나가는 것보다 낫다.
    const { data: participants } = await supabase
      .from('raid_participants')
      .select('*, members(nickname)')
      .eq('raid_id', raidId)
      .order('sort_order');

    // ── 4) 발송 ──
    const res = await fetch(guild.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: '정산봇',
        embeds: [
          {
            title: `${raid.boss_name} 레이드 정산`,
            description: raid.party_name ? `${raid.party_name} · ${raid.date}` : `${raid.date}`,
            color: 0xf97316,
            fields: [
              // 두괄식. inline 3개가 상단에 한 줄로 붙어 총액이 제일 먼저 읽힌다.
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
              ...participantFields(participants ?? []),
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

/**
 * 모든 응답에 CORS 헤더를 싣는다. 성공만 붙이면 안 된다 —
 * 헤더 없는 4xx 는 브라우저가 본문을 못 읽게 막아서, 화면이 code 를 보고
 * "웹훅 설정하러 갈까요?" 로 안내하는 분기가 통째로 죽는다.
 */
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function meso(n: number): string {
  return Number(n ?? 0).toLocaleString('ko-KR');
}

// 디스코드 embed 제약. 넘기면 400 이 떨어져 영수증이 통째로 안 나가므로 여기서 자른다.
const FIELD_VALUE_MAX = 1024;
const MAX_PARTICIPANT_FIELDS = 18; // 요약 필드(최대 5) + 참여자 = embed 필드 25 이내
const INDENT = '  '; // EM SPACE ×2. 디스코드는 일반 공백 들여쓰기를 접는다

interface ParticipantRow {
  member_id: string | null;
  guest_name: string | null;
  members: { nickname: string } | { nickname: string }[] | null;
  subsidy: number;
  penalty: number;
  redistributed: number;
  sale_incentive: number;
  incentive: number;
  leftover_share: number;
  final_amount: number;
  forfeited: boolean;
  is_leader: boolean;
  exit_phase: number | null;
}

/**
 * 참여자 이름. 길드원이면 members 임베드의 닉네임, 용병이면 guest_name 에 (용병) 표시.
 *
 * PostgREST 는 many-to-one 임베드를 객체로 주지만 클라이언트 버전에 따라 배열로 오는
 * 경우가 있어 양쪽을 다 받는다. 길드원이 탈퇴하면 member_id 가 null 로 풀려(0001 의
 * on delete set null) 이름이 사라지므로 그때는 guest_name 도 없어 폴백이 필요하다.
 */
function nameOf(p: ParticipantRow): string {
  const m = Array.isArray(p.members) ? p.members[0] : p.members;
  if (m?.nickname) return m.nickname;
  if (p.guest_name) return `${p.guest_name}(용병)`;
  return '(탈퇴한 길드원)';
}

/** 기본 n빵에서 벗어난 항목만 적는다. 전부 0이면 두 번째 줄 자체를 만들지 않는다. */
function adjustmentsOf(p: ParticipantRow): string {
  const parts: string[] = [];
  if (p.subsidy > 0) parts.push(`지원금 +${meso(p.subsidy)}`);
  if (p.sale_incentive > 0) parts.push(`판매인센 +${meso(p.sale_incentive)}`);
  if (p.incentive > 0) parts.push(`뽀찌 +${meso(p.incentive)}`);
  if (p.redistributed > 0) parts.push(`재분배 +${meso(p.redistributed)}`);
  if (p.leftover_share > 0) parts.push(`잔액 +${meso(p.leftover_share)}`);
  if (p.penalty > 0) parts.push(`벌금 -${meso(p.penalty)}`);

  const notes: string[] = [];
  if (p.exit_phase != null) notes.push(`${p.exit_phase}페 이탈`);
  if (p.forfeited) notes.push('몰수');

  const line = parts.join(' · ');
  if (notes.length === 0) return line;
  return line ? `${line}  ※${notes.join('·')}` : `※${notes.join('·')}`;
}

/**
 * 참여자 목록을 embed 필드로. 1024자를 넘으면 이어지는 필드로 쪼갠다.
 *
 * 한 필드에 다 밀어 넣으면 인원이 많은 공대에서 디스코드가 400 으로 거절한다.
 * 이어지는 필드 이름은 zero-width space — 디스코드가 빈 이름을 허용하지 않는데
 * 여기에 '참여자 (2)' 같은 걸 넣으면 목록이 끊긴 것처럼 읽힌다.
 */
function participantFields(rows: ParticipantRow[]): { name: string; value: string }[] {
  if (rows.length === 0) return [];

  const lines = rows.map((p) => {
    const crown = p.is_leader ? '👑 ' : '· ';
    const head = `${crown}**${nameOf(p)}** — **${meso(p.final_amount)}**`;
    const adj = adjustmentsOf(p);
    return adj ? `${head}\n${INDENT}${adj}` : head;
  });

  const chunks: string[] = [];
  let buf = '';
  for (const line of lines) {
    const next = buf ? `${buf}\n${line}` : line;
    if (next.length > FIELD_VALUE_MAX) {
      if (buf) chunks.push(buf);
      buf = line;
    } else {
      buf = next;
    }
  }
  if (buf) chunks.push(buf);

  const shown = chunks.slice(0, MAX_PARTICIPANT_FIELDS);
  const fields = shown.map((value, i) => ({ name: i === 0 ? '참여자' : '​', value }));
  if (chunks.length > shown.length) {
    fields.push({ name: '​', value: '…이하 생략 (웹에서 전체 확인)' });
  }
  return fields;
}
