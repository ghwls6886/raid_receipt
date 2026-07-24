import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Trash2, Copy, Check, FileText, Send } from 'lucide-react';
import { useCurrentGuild } from '@/stores/useGuildStore';
import {
  getBosses,
  getMembers,
  getGuildSettings,
  getRaids,
  getParties,
  getPenaltyTypes,
  getRaidDetail,
  getRaid,
  saveRaid,
  isRaidEditable,
  groupMembersByJob,
  REMAINDER_POLICY_LABEL,
  REMAINDER_POLICIES,
  type RaidStatus,
  type RaidInput,
  type RemainderPolicy,
} from '@/lib/api';
import { calcSettlement } from '@/lib/settlement';
import { formatMeso } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { LoadingState } from '@/components/feedback/LoadingState';
import { toast } from '@/stores/useToastStore';
import { confirm } from '@/stores/useConfirmStore';
import { cn } from '@/lib/cn';

interface MercRow {
  id: string;
  name: string;
  fee: number;
}
interface DropRow {
  id: string;
  name: string;
  salePrice: number;
}
interface MaterialRow {
  id: string;
  name: string;
  cost: number;
}

let localSeq = 0;
const localId = (): string => `local_${(localSeq += 1)}`;

const CATEGORY_DOT: Record<string, string> = {
  전사: 'bg-error-500',
  마법사: 'bg-accent-violet',
  궁수: 'bg-success-500',
  도적: 'bg-text-muted',
  해적: 'bg-warning-500',
};

const AUTOSAVE_MS = 5000;

/** 메소 금액 입력 — 천 단위 콤마 표기 + 숫자만 파싱 */
function MoneyInput({
  value,
  onChange,
  className,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  className?: string;
  placeholder?: string;
}) {
  return (
    <Input
      type="text"
      inputMode="numeric"
      className={cn('text-right', className)}
      placeholder={placeholder}
      value={value === 0 ? '' : formatMeso(value)}
      onChange={(e) => {
        const digits = e.target.value.replace(/[^0-9]/g, '');
        onChange(digits ? Number(digits) : 0);
      }}
    />
  );
}

/** 레이드 추가/수정 (명세서 §5) — 자동 임시저장 + 임시/미발송 건 재편집 */
export function RaidNewPage() {
  const navigate = useNavigate();
  const { id: routeId } = useParams();
  const isEdit = Boolean(routeId);
  const guild = useCurrentGuild();
  const queryClient = useQueryClient();

  const bossesQuery = useQuery({ queryKey: ['bosses'], queryFn: getBosses });
  const membersQuery = useQuery({
    queryKey: ['members', guild.id],
    queryFn: () => getMembers(guild.id),
  });
  const settingsQuery = useQuery({
    queryKey: ['guild-settings', guild.id],
    queryFn: () => getGuildSettings(guild.id),
  });
  const raidsQuery = useQuery({ queryKey: ['raids', guild.id], queryFn: () => getRaids(guild.id) });
  const partiesQuery = useQuery({
    queryKey: ['parties', guild.id],
    queryFn: () => getParties(guild.id),
  });
  const penaltyTypesQuery = useQuery({
    queryKey: ['penalty-types', guild.id],
    queryFn: () => getPenaltyTypes(guild.id),
  });
  const detailQuery = useQuery({
    queryKey: ['raid-detail', routeId],
    queryFn: () => getRaidDetail(routeId ?? ''),
    enabled: isEdit,
  });
  const rowQuery = useQuery({
    queryKey: ['raid', guild.id, routeId],
    queryFn: () => getRaid(guild.id, routeId ?? ''),
    enabled: isEdit,
  });

  const [bossName, setBossName] = useState('');
  const [ppojiPct, setPpojiPct] = useState(10);
  const [ppojiTouched, setPpojiTouched] = useState(false);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [penaltyByMember, setPenaltyByMember] = useState<Record<string, string>>({});
  const [mercs, setMercs] = useState<MercRow[]>([]);
  const [drops, setDrops] = useState<DropRow[]>([{ id: localId(), name: '', salePrice: 0 }]);
  const [remainderPolicy, setRemainderPolicy] = useState<RemainderPolicy>('fund');
  const [loadedPartyName, setLoadedPartyName] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | undefined>(undefined);
  const [wasConfirmed, setWasConfirmed] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const prefilledRef = useRef(false);

  // 길드 기본 뽀찌율 (신규 · 미변경 시)
  useEffect(() => {
    if (!isEdit && !ppojiTouched && settingsQuery.data) {
      setPpojiPct(Math.round(settingsQuery.data.ppojiRate * 100));
    }
  }, [isEdit, settingsQuery.data, ppojiTouched]);

  // 편집 진입: 수정 가능 여부 확인 + 대상 id/상태 확정
  useEffect(() => {
    if (!isEdit) return;
    const row = rowQuery.data;
    if (row === undefined) return; // 로딩 중
    if (row === null) {
      toast.error('레이드를 찾을 수 없습니다.');
      navigate('/raids');
      return;
    }
    if (!isRaidEditable(row)) {
      toast.error('발송 완료된 레이드는 수정할 수 없습니다.');
      navigate('/raids');
      return;
    }
    setDraftId(row.id);
    setWasConfirmed(row.status === 'confirmed');
  }, [isEdit, rowQuery.data, navigate]);

  // 편집 진입: 상세로 폼 복원 (1회)
  useEffect(() => {
    if (!isEdit || prefilledRef.current) return;
    const d = detailQuery.data;
    if (!d) return;
    prefilledRef.current = true;
    setBossName(d.bossName);
    setPpojiPct(d.ppojiPct);
    setPpojiTouched(true);
    setRemainderPolicy(d.remainderPolicy);
    setLoadedPartyName(d.partyName);
    setMaterials(d.materials.map((m) => ({ id: localId(), name: m.name, cost: m.cost })));
    setMercs(d.mercs.map((m) => ({ id: localId(), name: m.name, fee: m.fee })));
    setDrops(
      d.drops.length > 0
        ? d.drops.map((x) => ({ id: localId(), name: x.name, salePrice: x.salePrice }))
        : [{ id: localId(), name: '', salePrice: 0 }],
    );
    setSelected(new Set(d.participants.map((p) => p.memberId)));
    const penaltyEntries: Array<[string, string]> = [];
    for (const p of d.participants) {
      if (p.penaltyTypeId) penaltyEntries.push([p.memberId, p.penaltyTypeId]);
    }
    setPenaltyByMember(Object.fromEntries(penaltyEntries));
  }, [isEdit, detailQuery.data]);

  const members = membersQuery.data ?? [];
  const penaltyTypes = penaltyTypesQuery.data ?? [];
  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const penaltyById = useMemo(() => new Map(penaltyTypes.map((p) => [p.id, p])), [penaltyTypes]);

  const participantsInput = useMemo(
    () =>
      members
        .filter((m) => selected.has(m.id))
        .map((m) => {
          const pt = penaltyByMember[m.id] ? penaltyById.get(penaltyByMember[m.id] ?? '') : undefined;
          return {
            id: m.id,
            penalty: pt ? { calcType: pt.calcType, value: pt.value } : undefined,
          };
        }),
    [members, selected, penaltyByMember, penaltyById],
  );

  const result = useMemo(
    () =>
      calcSettlement({
        drops: drops.map((d) => ({ salePrice: d.salePrice || 0 })),
        mercenaries: mercs.map((m) => ({ fee: m.fee || 0 })),
        materialCost: materials.reduce((s, m) => s + (m.cost || 0), 0),
        participants: participantsInput,
        ppojiRate: (ppojiPct || 0) / 100,
      }),
    [drops, mercs, materials, participantsInput, ppojiPct],
  );

  const hasPenalty = result.penaltyPool > 0;
  // 패널티/재분배까지 반영한 최종 1인당 (패널티 없는 참여자 기준; 없으면 첫 참여자)
  const finalPerPerson =
    result.participants.find((p) => p.penalty === 0)?.final ??
    result.participants[0]?.final ??
    result.basePerPerson;
  const loading =
    bossesQuery.isLoading ||
    membersQuery.isLoading ||
    settingsQuery.isLoading ||
    (isEdit && (detailQuery.isLoading || rowQuery.isLoading));

  const buildInput = (status: RaidStatus, id?: string): RaidInput => ({
    id,
    bossName,
    partyName: loadedPartyName,
    ppojiPct,
    remainderPolicy,
    drops: drops.map((d) => ({ name: d.name, salePrice: d.salePrice })),
    materials: materials.map((m) => ({ name: m.name, cost: m.cost })),
    mercs: mercs.map((m) => ({ name: m.name, fee: m.fee })),
    participants: members
      .filter((m) => selected.has(m.id))
      .map((m) => ({ memberId: m.id, penaltyTypeId: penaltyByMember[m.id] ?? null })),
    netProfit: result.netProfit,
    participantCount: result.participantCount,
    perPerson: finalPerPerson,
    status,
  });

  // 자동 임시저장 — 확정된 건이 아니고, 보스+참여자가 있으면 몇 초 뒤 draft 저장
  const canAutosave = !wasConfirmed && !pending && bossName !== '' && selected.size > 0;
  useEffect(() => {
    if (loading || !canAutosave) return;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const row = await saveRaid(guild.id, buildInput('draft', draftId));
          setDraftId(row.id);
          setLastSavedAt(new Date().toLocaleTimeString('ko-KR'));
          void queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
        } catch {
          /* 자동저장 실패는 조용히 무시 */
        }
      })();
    }, AUTOSAVE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bossName, selected, drops, materials, mercs, ppojiPct, penaltyByMember, remainderPolicy, canAutosave, loading]);

  // ── 핸들러 ────────────────────────────────────────────
  const toggleMember = (id: string) => {
    const willRemove = selected.has(id);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    if (willRemove) {
      setPenaltyByMember((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    }
  };

  const setPenalty = (id: string, typeId: string) =>
    setPenaltyByMember((prev) => {
      const next = { ...prev };
      if (typeId) next[id] = typeId;
      else delete next[id];
      return next;
    });

  const addMerc = () => setMercs((prev) => [...prev, { id: localId(), name: '', fee: 0 }]);
  const updateMerc = (id: string, patch: Partial<MercRow>) =>
    setMercs((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMerc = (id: string) => setMercs((prev) => prev.filter((m) => m.id !== id));

  const addDrop = () => setDrops((prev) => [...prev, { id: localId(), name: '', salePrice: 0 }]);
  const updateDrop = (id: string, patch: Partial<DropRow>) =>
    setDrops((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const removeDrop = (id: string) =>
    setDrops((prev) => (prev.length <= 1 ? prev : prev.filter((d) => d.id !== id)));

  const addMaterial = () => setMaterials((prev) => [...prev, { id: localId(), name: '', cost: 0 }]);
  const updateMaterial = (id: string, patch: Partial<MaterialRow>) =>
    setMaterials((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  const removeMaterial = (id: string) => setMaterials((prev) => prev.filter((m) => m.id !== id));

  const copyLast = () => {
    const last = (raidsQuery.data ?? [])[0];
    if (!last) {
      toast.info('복제할 직전 레이드가 없습니다.');
      return;
    }
    setBossName(last.bossName);
    setSelected(new Set(members.map((m) => m.id)));
    setPenaltyByMember({});
    setLoadedPartyName(last.partyName);
    setDrops([{ id: localId(), name: '', salePrice: 0 }]);
    toast.success('직전 레이드를 복제했습니다. 판매가만 입력하세요.');
  };

  const applyParty = (partyId: string) => {
    const party = (partiesQuery.data ?? []).find((p) => p.id === partyId);
    if (!party) return;
    const valid = party.memberIds.filter((mid) => members.some((m) => m.id === mid));
    setSelected(new Set(valid));
    setPenaltyByMember({});
    setRemainderPolicy(party.remainderPolicy);
    setLoadedPartyName(party.name);
    toast.success(`${party.name} 공대원 ${valid.length}명을 불러왔습니다.`);
  };

  const save = async (status: RaidStatus) => {
    if (!bossName) {
      toast.warning('보스를 선택해 주세요.');
      return;
    }
    if (selected.size === 0) {
      toast.warning('참여 공대원을 1명 이상 선택해 주세요.');
      return;
    }
    if (status === 'confirmed') {
      if (result.totalSales <= 0) {
        toast.warning('드랍템 판매가를 입력해 주세요.');
        return;
      }
      const ok = await confirm.show({
        title: '레이드 확정',
        message: `확정하면 디스코드로 영수증이 발송됩니다. (무료 베타)\n1인당 ${formatMeso(finalPerPerson)} 메소 · ${result.participantCount}명`,
        confirmText: '확정 & 발송',
        type: 'default',
      });
      if (!ok) return;
    }

    setPending(true);
    try {
      await saveRaid(guild.id, buildInput(status, draftId));
      await queryClient.invalidateQueries({ queryKey: ['raids', guild.id] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard-stats', guild.id] });
      toast.success(
        status === 'confirmed' ? '확정되었습니다. 영수증을 발송했습니다.' : '임시저장되었습니다.',
      );
      navigate('/raids');
    } catch {
      toast.error('저장에 실패했습니다.');
    } finally {
      setPending(false);
    }
  };

  if (loading) {
    return (
      <Card className="p-10">
        <LoadingState message="불러오는 중..." />
      </Card>
    );
  }

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <button
          aria-label="뒤로"
          className="text-text-secondary hover:bg-bg-hover rounded-md p-2"
          onClick={() => navigate('/raids')}
          type="button"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-page-title">{isEdit ? '레이드 수정' : '레이드 추가'}</h1>
          <p className="text-text-secondary mt-0.5 text-sm">
            {guild.serverName} · {guild.guildName}
            {lastSavedAt && (
              <span className="text-text-tertiary ml-2">· 자동 임시저장 {lastSavedAt}</span>
            )}
          </p>
        </div>
        {!isEdit && (
          <Button variant="secondary" onClick={copyLast}>
            <Copy className="h-4 w-4" /> 직전 레이드 복제
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 입력 폼 */}
        <div className="space-y-4 lg:col-span-2">
          {/* 기본 정보 */}
          <Card className="space-y-4 p-5">
            <h2 className="text-card-title">기본 정보</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="text-text-secondary mb-1 block text-sm font-medium">보스</label>
                <Select value={bossName} onChange={(e) => setBossName(e.target.value)}>
                  <option value="">보스 선택</option>
                  {(bossesQuery.data ?? []).map((b) => (
                    <option key={b.id} value={b.name}>
                      {b.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <label className="text-text-secondary mb-1 block text-sm font-medium">
                  공대장 뽀찌율 (%)
                </label>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={ppojiPct}
                  onChange={(e) => {
                    setPpojiTouched(true);
                    setPpojiPct(Number(e.target.value) || 0);
                  }}
                />
              </div>
            </div>
          </Card>

          {/* 참여 공대원 (선택) */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">참여 공대원</h2>
              <span className="text-text-tertiary text-xs">분배 인원 {selected.size}명 · 용병 제외</span>
            </div>
            {(partiesQuery.data ?? []).length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-text-secondary shrink-0 text-xs font-medium">공대 불러오기</span>
                <Select
                  className="max-w-xs"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) applyParty(e.target.value);
                  }}
                >
                  <option value="">임시 공대 (직접 선택)</option>
                  {(partiesQuery.data ?? []).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.memberIds.length}명)
                    </option>
                  ))}
                </Select>
              </div>
            )}
            {members.length === 0 ? (
              <p className="text-text-muted py-6 text-center text-sm">
                먼저{' '}
                <button
                  className="text-text-link hover:text-text-link-hover font-medium"
                  onClick={() => navigate('/members')}
                  type="button"
                >
                  길드원
                </button>
                을 등록해 주세요.
              </p>
            ) : (
              <div className="space-y-4">
                {groupMembersByJob(members).map((sec) => (
                  <div key={sec.category}>
                    <div className="mb-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'h-2 w-2 rounded-full',
                          CATEGORY_DOT[sec.category] ?? 'bg-text-muted',
                        )}
                      />
                      <span className="text-text-secondary text-xs font-semibold">{sec.category}</span>
                      <span className="text-text-muted text-xs">{sec.members.length}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                      {sec.members.map((m) => {
                        const on = selected.has(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => toggleMember(m.id)}
                            className={cn(
                              'flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors',
                              on
                                ? 'border-brand-500 bg-brand-50 text-brand-700'
                                : 'border-border-subtle text-text-secondary hover:bg-bg-hover',
                            )}
                          >
                            <span
                              className={cn(
                                'flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                                on
                                  ? 'border-brand-600 bg-brand-600 text-white'
                                  : 'border-border-default',
                              )}
                            >
                              {on && <Check className="h-3 w-3" />}
                            </span>
                            <span className="min-w-0 flex-1 truncate">
                              <span className="font-medium">{m.nickname}</span>
                              <span className="text-text-tertiary ml-1 text-xs">{m.job}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 용병 */}
            <div className="border-border-subtle mt-2 border-t pt-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-text-secondary text-sm font-medium">용병 (고정 수당 · 분배 미포함)</span>
                <Button size="sm" variant="ghost" onClick={addMerc}>
                  <Plus className="h-4 w-4" /> 용병 추가
                </Button>
              </div>
              {mercs.length === 0 ? (
                <p className="text-text-muted text-xs">용병이 없으면 비워 두세요.</p>
              ) : (
                <div className="space-y-2">
                  {mercs.map((m) => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Input
                        placeholder="용병 이름"
                        value={m.name}
                        onChange={(e) => updateMerc(m.id, { name: e.target.value })}
                        className="flex-1"
                      />
                      <MoneyInput
                        placeholder="수당(메소)"
                        value={m.fee}
                        onChange={(fee) => updateMerc(m.id, { fee })}
                        className="w-40"
                      />
                      <button
                        aria-label="용병 삭제"
                        className="text-text-muted hover:text-error-600 rounded-md p-2"
                        onClick={() => removeMerc(m.id)}
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>

          {/* ① 재료비 (아이템별) */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-card-title">① 재료비 (소모품 지원금)</h2>
                <p className="text-text-tertiary mt-0.5 text-xs">
                  합계 {formatMeso(result.materialCost)} 메소 · 순수익에서 차감됩니다
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={addMaterial}>
                <Plus className="h-4 w-4" /> 재료 추가
              </Button>
            </div>
            {materials.length === 0 ? (
              <p className="text-text-muted text-xs">재료비가 없으면 비워 두세요.</p>
            ) : (
              <div className="space-y-2">
                {materials.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <Input
                      placeholder="재료 이름 (예: 엘릭서, 주문서)"
                      value={m.name}
                      onChange={(e) => updateMaterial(m.id, { name: e.target.value })}
                      className="flex-1"
                    />
                    <MoneyInput
                      placeholder="금액(메소)"
                      value={m.cost}
                      onChange={(cost) => updateMaterial(m.id, { cost })}
                      className="w-40"
                    />
                    <button
                      aria-label="재료 삭제"
                      className="text-text-muted hover:text-error-600 rounded-md p-2"
                      onClick={() => removeMaterial(m.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* ② 드랍템 & 판매가 */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-card-title">② 드랍템 & 판매가</h2>
                <p className="text-text-tertiary mt-0.5 text-xs">
                  총 판매금액 {formatMeso(result.totalSales)} 메소
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={addDrop}>
                <Plus className="h-4 w-4" /> 드랍템 추가
              </Button>
            </div>
            <div className="space-y-2">
              {drops.map((d) => (
                <div key={d.id} className="flex items-center gap-2">
                  <Input
                    placeholder="드랍템 이름 (예: 이지스)"
                    value={d.name}
                    onChange={(e) => updateDrop(d.id, { name: e.target.value })}
                    className="flex-1"
                  />
                  <MoneyInput
                    placeholder="판매가(메소)"
                    value={d.salePrice}
                    onChange={(salePrice) => updateDrop(d.id, { salePrice })}
                    className="w-40"
                  />
                  <button
                    aria-label="드랍템 삭제"
                    className="text-text-muted hover:text-error-600 rounded-md p-2 disabled:opacity-40"
                    onClick={() => removeDrop(d.id)}
                    disabled={drops.length <= 1}
                    type="button"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </Card>

          {/* ③ 참여자별 정산 */}
          <Card className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-card-title">③ 참여자별 정산</h2>
              <span className="text-text-tertiary text-xs">
                패널티 차감분은 나머지 인원에게 재분배됩니다
              </span>
            </div>
            {selected.size === 0 ? (
              <p className="text-text-muted py-6 text-center text-sm">
                위에서 참여 공대원을 먼저 선택하세요.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[440px] text-sm">
                  <thead>
                    <tr className="border-border-subtle text-text-tertiary border-b text-xs">
                      <th className="py-2 pr-2 text-left font-medium">공대원</th>
                      <th className="py-2 pr-2 text-left font-medium">패널티 유형</th>
                      <th className="py-2 text-right font-medium">최종 수령</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.participants.map((pr) => {
                      const member = memberById.get(pr.id);
                      if (!member) return null;
                      return (
                        <tr key={pr.id} className="border-border-subtle border-b last:border-0">
                          <td className="py-2 pr-2">
                            <span className="text-text-primary font-medium">{member.nickname}</span>
                            <span className="text-text-tertiary ml-1 text-xs">{member.job}</span>
                          </td>
                          <td className="py-2 pr-2">
                            <Select
                              className="max-w-[11rem]"
                              value={penaltyByMember[pr.id] ?? ''}
                              onChange={(e) => setPenalty(pr.id, e.target.value)}
                            >
                              <option value="">없음</option>
                              {penaltyTypes.map((pt) => (
                                <option key={pt.id} value={pt.id}>
                                  {pt.name} (
                                  {pt.calcType === 'percent' ? `${pt.value}%` : formatMeso(pt.value)})
                                </option>
                              ))}
                            </Select>
                          </td>
                          <td className="py-2 text-right">
                            <div className="text-text-primary font-semibold tabular-nums">
                              {formatMeso(pr.final)}
                            </div>
                            {(pr.penalty > 0 || pr.redistributed > 0) && (
                              <div className="text-xs tabular-nums">
                                {pr.penalty > 0 && (
                                  <span className="text-error-600">−{formatMeso(pr.penalty)}</span>
                                )}
                                {pr.redistributed > 0 && (
                                  <span className="text-success-600 ml-1">
                                    +{formatMeso(pr.redistributed)}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {penaltyTypes.length === 0 && (
              <p className="text-text-tertiary text-xs">
                패널티 유형은{' '}
                <button
                  className="text-text-link hover:text-text-link-hover font-medium"
                  onClick={() => navigate('/settings')}
                  type="button"
                >
                  길드 설정
                </button>
                에서 추가합니다.
              </p>
            )}
          </Card>
        </div>

        {/* 정산 요약 */}
        <div className="lg:col-span-1">
          <Card className="sticky top-32 p-5">
            <h2 className="text-card-title mb-4">정산 요약</h2>
            <dl className="space-y-2 text-sm">
              <SummaryRow label="총 판매금액" value={result.totalSales} />
              <SummaryRow label="− 용병비" value={-result.mercCost} muted />
              <SummaryRow label="− 재료비" value={-result.materialCost} muted />
              <div className="border-border-subtle my-2 border-t" />
              <SummaryRow label="순수익" value={result.netProfit} strong />
              <SummaryRow label={`− 공대장 뽀찌 (${ppojiPct}%)`} value={-result.leaderPpoji} muted />
              <SummaryRow label="분배 대상액" value={result.distributable} strong />
              <div className="border-border-subtle my-2 border-t" />
              <div className="flex items-center justify-between">
                <dt className="text-text-secondary">참여 인원</dt>
                <dd className="text-text-primary font-medium">{result.participantCount}명</dd>
              </div>
            </dl>

            <div className="bg-brand-50 mt-4 rounded-lg p-4 text-center">
              <p className="text-brand-700 text-xs font-medium">1인당 분배금 (최종)</p>
              <p className="text-brand-700 mt-1 text-2xl font-bold tabular-nums">
                {formatMeso(finalPerPerson)}
                <span className="ml-1 text-sm font-normal">메소</span>
              </p>
              {hasPenalty && (
                <p className="text-text-tertiary mt-1 text-xs">
                  패널티 대상자는 개인별 금액이 다릅니다 → <b>③ 참여자별 정산</b> 참고
                </p>
              )}
            </div>

            <div className="mt-3">
              <label className="text-text-tertiary mb-1 block text-xs font-medium">잔돈 처리</label>
              <Select
                value={remainderPolicy}
                onChange={(e) => setRemainderPolicy(e.target.value as RemainderPolicy)}
              >
                {REMAINDER_POLICIES.map((p) => (
                  <option key={p} value={p}>
                    {REMAINDER_POLICY_LABEL[p]}
                  </option>
                ))}
              </Select>
              <p className="text-text-tertiary mt-1.5 text-xs leading-relaxed">
                메소 단위로 딱 나눠떨어지지 않고 남는 자투리{' '}
                <b className="text-text-secondary">{formatMeso(result.leftover)} 메소</b>가{' '}
                {REMAINDER_POLICY_LABEL[remainderPolicy]}(으)로 처리됩니다.
                {hasPenalty && (
                  <>
                    {' '}
                    패널티로 걷힌{' '}
                    <b className="text-text-secondary">{formatMeso(result.penaltyPool)} 메소</b>는 나머지
                    인원에게 재분배됩니다.
                  </>
                )}
              </p>
            </div>

            <div className="mt-4 space-y-2">
              <Button className="w-full" onClick={() => void save('confirmed')} disabled={pending}>
                <Send className="h-4 w-4" /> 확정 & 발송
              </Button>
              <Button
                className="w-full"
                variant="secondary"
                onClick={() => void save('draft')}
                disabled={pending}
              >
                <FileText className="h-4 w-4" /> 임시저장
              </Button>
              <p className="text-text-tertiary text-center text-xs">
                무료 베타 · 입력 중 몇 초마다 자동 임시저장됩니다.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

interface SummaryRowProps {
  label: string;
  value: number;
  muted?: boolean;
  strong?: boolean;
}

function SummaryRow({ label, value, muted, strong }: SummaryRowProps) {
  return (
    <div className="flex items-center justify-between">
      <dt className={cn(muted ? 'text-text-tertiary' : 'text-text-secondary')}>{label}</dt>
      <dd
        className={cn(
          'tabular-nums',
          strong ? 'text-text-primary text-base font-semibold' : 'text-text-primary',
          value < 0 && 'text-text-tertiary',
        )}
      >
        {formatMeso(value)}
      </dd>
    </div>
  );
}
