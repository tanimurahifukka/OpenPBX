// 整形外科の問診フロー (モック / 学習用)
// node を id で参照する分岐ツリー。各ノードは「質問 / 情報 / 推奨」のいずれか。
//
// 注意: 本フローは PBX MVP の UI モックであり、実際の医学的推奨には準じていません。
// 臨床判断はあくまで医師が行うこと。

export type NodeType = 'question' | 'recommend';

export interface FlowOption {
  label: string;
  next: string;          // 次のノード id
  flag?: 'red' | 'urgent' | 'normal'; // レッドフラグ強調用
}

export interface FlowNode {
  id: string;
  type: NodeType;
  text: string;          // 表示テキスト
  hint?: string;          // 補足
  options?: FlowOption[]; // 質問の選択肢
  recommends?: Recommendation[]; // recommend 時の推奨群
}

export interface Recommendation {
  kind: 'xray' | 'ct' | 'mri' | 'us' | 'lab' | 'rx' | 'referral' | 'note';
  text: string;
  urgent?: boolean;
}

export const KIND_LABEL: Record<Recommendation['kind'], string> = {
  xray: 'レントゲン',
  ct: 'CT',
  mri: 'MRI',
  us: 'エコー',
  lab: '採血',
  rx: '処方',
  referral: '紹介・転送',
  note: 'メモ',
};

export const KIND_COLOR: Record<Recommendation['kind'], string> = {
  xray: 'border-sky-300 bg-sky-50 text-sky-900',
  ct: 'border-indigo-300 bg-indigo-50 text-indigo-900',
  mri: 'border-violet-300 bg-violet-50 text-violet-900',
  us: 'border-teal-300 bg-teal-50 text-teal-900',
  lab: 'border-amber-300 bg-amber-50 text-amber-900',
  rx: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  referral: 'border-rose-300 bg-rose-50 text-rose-900',
  note: 'border-slate-300 bg-slate-50 text-slate-800',
};

// ----- 共通レッドフラグチェック -----
const redFlagCheck: FlowOption[] = [
  { label: '夜間痛で目が覚める', next: 'redflag-night', flag: 'red' },
  { label: '体重減少 / 微熱が続く', next: 'redflag-systemic', flag: 'red' },
  { label: '排尿排便障害 / 下肢麻痺', next: 'redflag-caudaequina', flag: 'urgent' },
  { label: '当てはまらない', next: 'start' },
];

export const FLOW: Record<string, FlowNode> = {
  // -------- entry --------
  start: {
    id: 'start',
    type: 'question',
    text: '主訴はどの部位ですか？',
    hint: '電話を取った段階で「どこが痛い / 動かない」を聞き取って選択',
    options: [
      { label: '腰', next: 'lumbar-onset' },
      { label: '頚部 (首)', next: 'cervical-onset' },
      { label: '肩', next: 'shoulder-onset' },
      { label: '膝', next: 'knee-onset' },
      { label: '足首 / 足', next: 'ankle-onset' },
      { label: '手 / 手首', next: 'wrist-onset' },
      { label: '股関節', next: 'hip-onset' },
      { label: 'その他 (発熱・しびれ・全身)', next: 'systemic-1' },
    ],
  },

  // ===================== 腰痛 =====================
  'lumbar-onset': {
    id: 'lumbar-onset',
    type: 'question',
    text: '腰痛はいつから始まりましたか？',
    options: [
      { label: '今日 / 数日以内 (急性)', next: 'lumbar-acute-trauma' },
      { label: '数週間 (亜急性)', next: 'lumbar-subacute' },
      { label: '数ヶ月以上 (慢性)', next: 'lumbar-chronic' },
    ],
  },
  'lumbar-acute-trauma': {
    id: 'lumbar-acute-trauma',
    type: 'question',
    text: '何か外傷 (転倒・尻もち・交通事故など) はありましたか？',
    options: [
      { label: 'あり (高エネルギー外傷)', next: 'lumbar-trauma-high', flag: 'urgent' },
      { label: 'あり (軽い転倒など)', next: 'lumbar-trauma-low' },
      { label: 'なし、急にぎっくり腰', next: 'lumbar-nontrauma-neuro' },
    ],
  },
  'lumbar-trauma-high': {
    id: 'lumbar-trauma-high',
    type: 'recommend',
    text: '高エネルギー外傷あり — 急性脊椎損傷を疑う',
    recommends: [
      { kind: 'xray', text: '腰椎レントゲン正面・側面', urgent: true },
      { kind: 'ct', text: '腰椎 CT (骨傷確認)', urgent: true },
      { kind: 'mri', text: '神経症状あれば腰椎 MRI 追加', urgent: true },
      { kind: 'referral', text: '神経症状ある場合は脊椎外科へ即時相談', urgent: true },
      { kind: 'note', text: '搬送基準あれば救急要請を検討' },
    ],
  },
  'lumbar-trauma-low': {
    id: 'lumbar-trauma-low',
    type: 'question',
    text: '下肢のしびれ・力が入らない感覚はありますか？',
    options: [
      { label: 'あり', next: 'lumbar-radicular' },
      { label: 'なし', next: 'lumbar-noradic-trauma' },
    ],
  },
  'lumbar-noradic-trauma': {
    id: 'lumbar-noradic-trauma',
    type: 'recommend',
    text: '軽度外傷後の腰痛 (神経症状なし)',
    recommends: [
      { kind: 'xray', text: '腰椎レントゲン正面・側面 (圧迫骨折除外)' },
      { kind: 'rx', text: 'NSAIDs (ロキソプロフェンなど) 5-7 日' },
      { kind: 'note', text: '高齢 / 骨粗鬆症リスクあれば MRI 追加' },
    ],
  },
  'lumbar-nontrauma-neuro': {
    id: 'lumbar-nontrauma-neuro',
    type: 'question',
    text: '下肢のしびれ / 力の抜け / 排尿障害はありますか？',
    options: [
      { label: '排尿障害あり / 両下肢麻痺', next: 'lumbar-caudaequina', flag: 'urgent' },
      { label: '片側のしびれ / 坐骨神経痛', next: 'lumbar-radicular' },
      { label: 'なし (純粋なぎっくり腰)', next: 'lumbar-mechanical' },
    ],
  },
  'lumbar-caudaequina': {
    id: 'lumbar-caudaequina',
    type: 'recommend',
    text: '⚠️ 馬尾症候群を疑う緊急サイン',
    recommends: [
      { kind: 'mri', text: '腰椎 MRI 緊急 (本日中)', urgent: true },
      { kind: 'referral', text: '脊椎外科 / 整形外科病院へ即時紹介', urgent: true },
      { kind: 'note', text: '麻痺出現 48 時間以内の除圧が予後を分ける' },
    ],
  },
  'lumbar-radicular': {
    id: 'lumbar-radicular',
    type: 'recommend',
    text: '神経根症状あり — 椎間板ヘルニア / 脊柱管狭窄症を想起',
    recommends: [
      { kind: 'xray', text: '腰椎レントゲン正面・側面・斜位' },
      { kind: 'mri', text: '腰椎 MRI (神経圧迫部位の確認)' },
      { kind: 'lab', text: '採血: WBC, CRP (感染性脊椎炎除外)' },
      { kind: 'rx', text: 'NSAIDs + プレガバリン考慮' },
      { kind: 'note', text: 'SLR テスト陽性域を診察で確認' },
    ],
  },
  'lumbar-mechanical': {
    id: 'lumbar-mechanical',
    type: 'recommend',
    text: '機械的腰痛 (ぎっくり腰) — まず安静と鎮痛',
    recommends: [
      { kind: 'xray', text: '初診時は腰椎レントゲン 1 回で十分なことが多い' },
      { kind: 'rx', text: 'NSAIDs + 筋弛緩薬 5-7 日' },
      { kind: 'note', text: '2 週間で改善なければ MRI 検討' },
    ],
  },
  'lumbar-subacute': {
    id: 'lumbar-subacute',
    type: 'question',
    text: '次のレッドフラグはありますか？',
    options: redFlagCheck.map((o) => o.next === 'start' ? { ...o, next: 'lumbar-subacute-clear' } : o),
  },
  'lumbar-subacute-clear': {
    id: 'lumbar-subacute-clear',
    type: 'recommend',
    text: '亜急性腰痛 (レッドフラグなし)',
    recommends: [
      { kind: 'xray', text: '腰椎レントゲン正面・側面' },
      { kind: 'lab', text: 'CRP / WBC で炎症性除外' },
      { kind: 'rx', text: 'NSAIDs 継続 + 理学療法' },
      { kind: 'note', text: '4 週で改善なければ MRI へ' },
    ],
  },
  'lumbar-chronic': {
    id: 'lumbar-chronic',
    type: 'recommend',
    text: '慢性腰痛 — 器質的疾患スクリーニング',
    recommends: [
      { kind: 'xray', text: '腰椎レントゲン正面・側面 (変性評価)' },
      { kind: 'mri', text: '腰椎 MRI (椎間板変性 / 狭窄)' },
      { kind: 'lab', text: '採血: CBC, CRP, ESR, ALP, Ca, 血糖, HbA1c' },
      { kind: 'referral', text: '腫瘍マーカー (PSA, CEA) も併せて高齢者は検討' },
      { kind: 'rx', text: 'アセトアミノフェン優先 / 筋緊張に応じて筋弛緩薬' },
    ],
  },
  'redflag-night': {
    id: 'redflag-night',
    type: 'recommend',
    text: '⚠️ 夜間痛 — 腫瘍 / 感染を考慮',
    recommends: [
      { kind: 'mri', text: '腰椎 MRI (gadolinium 造影考慮)' },
      { kind: 'lab', text: 'CBC, CRP, ESR, ALP, Ca, 血糖, 腫瘍マーカー' },
      { kind: 'referral', text: '所見によって脊椎外科 or 内科へ' },
    ],
  },
  'redflag-systemic': {
    id: 'redflag-systemic',
    type: 'recommend',
    text: '⚠️ 全身症状あり — 化膿性脊椎炎 / 結核 / 悪性腫瘍除外',
    recommends: [
      { kind: 'mri', text: '腰椎 MRI (造影含む) 緊急', urgent: true },
      { kind: 'lab', text: 'CBC, CRP, ESR, プロカルシトニン, 血液培養 (発熱時)' },
      { kind: 'referral', text: '整形外科病院 / 感染症内科へ紹介', urgent: true },
    ],
  },
  'redflag-caudaequina': {
    id: 'redflag-caudaequina',
    type: 'recommend',
    text: '⚠️ 馬尾症候群疑い — 緊急対応',
    recommends: [
      { kind: 'mri', text: '腰椎 MRI 当日中', urgent: true },
      { kind: 'referral', text: '脊椎外科に即時紹介、必要なら救急搬送', urgent: true },
    ],
  },

  // ===================== 頚部痛 =====================
  'cervical-onset': {
    id: 'cervical-onset',
    type: 'question',
    text: '頚部痛は外傷後 (むち打ちなど) ですか？',
    options: [
      { label: '交通事故・転倒など外傷直後', next: 'cervical-trauma', flag: 'urgent' },
      { label: '寝違え / 慢性的な痛み', next: 'cervical-nontrauma' },
    ],
  },
  'cervical-trauma': {
    id: 'cervical-trauma',
    type: 'recommend',
    text: '頚椎外傷 — 不安定性除外',
    recommends: [
      { kind: 'xray', text: '頚椎レントゲン正面・側面・開口位', urgent: true },
      { kind: 'ct', text: '頚椎 CT (骨折除外)', urgent: true },
      { kind: 'mri', text: '神経症状あれば頚椎 MRI', urgent: true },
      { kind: 'note', text: '不安定性疑いはカラー固定で搬送' },
    ],
  },
  'cervical-nontrauma': {
    id: 'cervical-nontrauma',
    type: 'question',
    text: '上肢のしびれ / 筋力低下はありますか？',
    options: [
      { label: 'あり', next: 'cervical-radicular' },
      { label: 'なし', next: 'cervical-mechanical' },
    ],
  },
  'cervical-radicular': {
    id: 'cervical-radicular',
    type: 'recommend',
    text: '頚椎神経根症状 — 椎間板ヘルニア / 頚椎症性神経根症',
    recommends: [
      { kind: 'xray', text: '頚椎レントゲン正面・側面・斜位' },
      { kind: 'mri', text: '頚椎 MRI (椎間孔狭窄評価)' },
      { kind: 'rx', text: 'NSAIDs + ビタミン B12, プレガバリン' },
    ],
  },
  'cervical-mechanical': {
    id: 'cervical-mechanical',
    type: 'recommend',
    text: '機械的頚部痛 (寝違え / 筋筋膜性)',
    recommends: [
      { kind: 'xray', text: '初診時は頚椎レントゲン正面・側面' },
      { kind: 'rx', text: 'NSAIDs + 筋弛緩薬 + 温熱療法' },
    ],
  },

  // ===================== 肩 =====================
  'shoulder-onset': {
    id: 'shoulder-onset',
    type: 'question',
    text: '肩の症状は？',
    options: [
      { label: '転倒や脱臼の既往あり', next: 'shoulder-trauma' },
      { label: '腕が上がらない / 夜間痛', next: 'shoulder-rotator' },
      { label: '徐々に可動域低下', next: 'shoulder-frozen' },
    ],
  },
  'shoulder-trauma': {
    id: 'shoulder-trauma',
    type: 'recommend',
    text: '肩外傷 / 脱臼疑い',
    recommends: [
      { kind: 'xray', text: '肩関節レントゲン 正面・腋窩位・Y view', urgent: true },
      { kind: 'ct', text: '骨折疑い時 CT' },
      { kind: 'note', text: '脱臼確認なら徒手整復 → 整復後 X-P 再撮影' },
    ],
  },
  'shoulder-rotator': {
    id: 'shoulder-rotator',
    type: 'recommend',
    text: '腱板損傷 / インピンジメント疑い',
    recommends: [
      { kind: 'xray', text: '肩関節 X-P (大結節変化)' },
      { kind: 'us', text: '肩関節エコー (腱板の連続性評価)' },
      { kind: 'mri', text: '完全断裂疑いは MRI 追加' },
      { kind: 'rx', text: 'NSAIDs + リハビリ' },
    ],
  },
  'shoulder-frozen': {
    id: 'shoulder-frozen',
    type: 'recommend',
    text: '五十肩 (癒着性関節包炎) 疑い',
    recommends: [
      { kind: 'xray', text: '肩関節 X-P (石灰沈着・関節症の除外)' },
      { kind: 'lab', text: '糖尿病合併多い: HbA1c 確認' },
      { kind: 'rx', text: 'NSAIDs / 関節注射 (ヒアルロン酸 or ステロイド)' },
      { kind: 'note', text: 'リハビリで可動域訓練' },
    ],
  },

  // ===================== 膝 =====================
  'knee-onset': {
    id: 'knee-onset',
    type: 'question',
    text: '膝の症状は外傷後ですか？',
    options: [
      { label: 'スポーツ中の捻り / 受傷あり', next: 'knee-trauma' },
      { label: '徐々に痛み、加齢性 (中高年)', next: 'knee-oa' },
      { label: '腫れと発赤、発熱', next: 'knee-infectious', flag: 'urgent' },
    ],
  },
  'knee-trauma': {
    id: 'knee-trauma',
    type: 'recommend',
    text: '膝外傷 — 半月板 / 靭帯損傷を考慮',
    recommends: [
      { kind: 'xray', text: '膝関節レントゲン 正面・側面・skyline・荷重位' },
      { kind: 'us', text: '関節血腫の有無を US で簡便確認' },
      { kind: 'mri', text: '不安定性 / クリック音あれば MRI (ACL/MCL/半月板)' },
      { kind: 'note', text: 'Lachman / McMurray の所見記載' },
    ],
  },
  'knee-oa': {
    id: 'knee-oa',
    type: 'recommend',
    text: '変形性膝関節症 疑い',
    recommends: [
      { kind: 'xray', text: '荷重位膝 X-P (Rosenberg 撮影含む)' },
      { kind: 'rx', text: 'NSAIDs + ヒアルロン酸関節注射' },
      { kind: 'lab', text: '炎症徴候あれば CRP / 尿酸 / RA factor' },
      { kind: 'note', text: '体重指導・大腿四頭筋訓練' },
    ],
  },
  'knee-infectious': {
    id: 'knee-infectious',
    type: 'recommend',
    text: '⚠️ 化膿性関節炎 / 結晶性関節炎を疑う',
    recommends: [
      { kind: 'lab', text: 'CBC, CRP, 尿酸, 血液培養', urgent: true },
      { kind: 'xray', text: '膝 X-P (関節裂隙・石灰化)' },
      { kind: 'note', text: '関節穿刺 → 鏡検 / 培養', urgent: true },
      { kind: 'referral', text: '化膿性疑いは入院加療検討', urgent: true },
    ],
  },

  // ===================== 足首・足 =====================
  'ankle-onset': {
    id: 'ankle-onset',
    type: 'question',
    text: '足首の症状は？',
    options: [
      { label: '捻挫直後', next: 'ankle-sprain' },
      { label: '腫れと熱感、発熱あり', next: 'ankle-gout' },
      { label: '慢性的な痛み', next: 'ankle-chronic' },
    ],
  },
  'ankle-sprain': {
    id: 'ankle-sprain',
    type: 'recommend',
    text: '足関節捻挫 (Ottawa rule 適用)',
    recommends: [
      { kind: 'xray', text: 'Ottawa Ankle Rule 陽性なら足関節 X-P' },
      { kind: 'rx', text: 'RICE + NSAIDs, 8 字包帯 / シーネ' },
      { kind: 'note', text: '荷重不能 / 圧痛強ければ MRI 追加' },
    ],
  },
  'ankle-gout': {
    id: 'ankle-gout',
    type: 'recommend',
    text: '痛風発作 / 偽痛風疑い',
    recommends: [
      { kind: 'lab', text: '尿酸値, CRP, CBC' },
      { kind: 'xray', text: '足部 X-P (痛風結節除外)' },
      { kind: 'rx', text: 'NSAIDs (発作期), 発作沈静後にフェブキソスタット' },
    ],
  },
  'ankle-chronic': {
    id: 'ankle-chronic',
    type: 'recommend',
    text: '慢性足部痛 — 変形 / 過用症候群',
    recommends: [
      { kind: 'xray', text: '足部 X-P (荷重位)' },
      { kind: 'us', text: '足底腱膜炎なら US' },
      { kind: 'rx', text: 'NSAIDs + 装具 / 足底板' },
    ],
  },

  // ===================== 手首・手 =====================
  'wrist-onset': {
    id: 'wrist-onset',
    type: 'question',
    text: '手首・手の症状は？',
    options: [
      { label: '転倒で手をついた直後', next: 'wrist-trauma' },
      { label: '夜間に痺れる (CTS 疑い)', next: 'wrist-cts' },
      { label: '腱の痛み (ばね指 / 腱鞘炎)', next: 'wrist-tendon' },
    ],
  },
  'wrist-trauma': {
    id: 'wrist-trauma',
    type: 'recommend',
    text: '手関節外傷 — 橈骨遠位端 / 舟状骨骨折を考慮',
    recommends: [
      { kind: 'xray', text: '手関節 X-P 正面・側面・舟状骨撮影', urgent: true },
      { kind: 'ct', text: '舟状骨骨折疑いで X-P 陰性なら CT' },
      { kind: 'note', text: '骨折なくとも舟状骨 tenderness ならシーネ + 2 週後再評価' },
    ],
  },
  'wrist-cts': {
    id: 'wrist-cts',
    type: 'recommend',
    text: '手根管症候群疑い',
    recommends: [
      { kind: 'us', text: '正中神経エコー (断面積 ≥ 10mm²)' },
      { kind: 'lab', text: '甲状腺機能 / 糖尿病 (HbA1c) 確認' },
      { kind: 'rx', text: '夜間スプリント + NSAIDs' },
      { kind: 'note', text: '保存治療 3 ヶ月効果なければ手術検討' },
    ],
  },
  'wrist-tendon': {
    id: 'wrist-tendon',
    type: 'recommend',
    text: '腱鞘炎 / ばね指',
    recommends: [
      { kind: 'us', text: '指 / 母指 US (A1 pulley 肥厚評価)' },
      { kind: 'rx', text: 'NSAIDs + ステロイド腱鞘内注射' },
    ],
  },

  // ===================== 股関節 =====================
  'hip-onset': {
    id: 'hip-onset',
    type: 'question',
    text: '股関節の症状は？',
    options: [
      { label: '転倒後の歩行不能 (高齢)', next: 'hip-fx', flag: 'urgent' },
      { label: '徐々に可動域制限', next: 'hip-oa' },
      { label: '小児 / 思春期', next: 'hip-pediatric' },
    ],
  },
  'hip-fx': {
    id: 'hip-fx',
    type: 'recommend',
    text: '⚠️ 大腿骨頚部骨折 / 転子部骨折 強疑',
    recommends: [
      { kind: 'xray', text: '股関節 X-P 正面・側面', urgent: true },
      { kind: 'ct', text: 'X-P 陰性でも疑わしければ CT / MRI', urgent: true },
      { kind: 'lab', text: '術前評価: CBC, 凝固, 生化, 心電図, 胸写' },
      { kind: 'referral', text: '整形外科病院 / 救急搬送', urgent: true },
    ],
  },
  'hip-oa': {
    id: 'hip-oa',
    type: 'recommend',
    text: '変形性股関節症',
    recommends: [
      { kind: 'xray', text: '股関節 X-P 正面・側面・骨盤正面' },
      { kind: 'rx', text: 'NSAIDs + 体重指導 + リハビリ' },
      { kind: 'referral', text: '進行例は人工股関節置換術検討' },
    ],
  },
  'hip-pediatric': {
    id: 'hip-pediatric',
    type: 'recommend',
    text: '小児・思春期股関節痛 — Perthes / SCFE / 一過性滑膜炎',
    recommends: [
      { kind: 'xray', text: '股関節 X-P 正面・蛙肢位' },
      { kind: 'us', text: '関節液貯留評価' },
      { kind: 'lab', text: '発熱伴うなら CRP, CBC' },
      { kind: 'referral', text: 'SCFE 疑いは即時専門医', urgent: true },
    ],
  },

  // ===================== 全身 / その他 =====================
  'systemic-1': {
    id: 'systemic-1',
    type: 'question',
    text: '全身的症状について — 発熱はありますか？',
    options: [
      { label: 'あり 38℃ 以上', next: 'systemic-fever', flag: 'urgent' },
      { label: '微熱程度', next: 'systemic-lowfever' },
      { label: 'なし', next: 'systemic-numb' },
    ],
  },
  'systemic-fever': {
    id: 'systemic-fever',
    type: 'recommend',
    text: '⚠️ 発熱 + 整形症状 — 化膿性関節炎 / 骨髄炎を疑う',
    recommends: [
      { kind: 'lab', text: 'CBC, CRP, ESR, プロカルシトニン, 血液培養', urgent: true },
      { kind: 'mri', text: '罹患部 MRI (造影)', urgent: true },
      { kind: 'referral', text: '入院加療が必要な場合は早急に紹介', urgent: true },
    ],
  },
  'systemic-lowfever': {
    id: 'systemic-lowfever',
    type: 'recommend',
    text: '微熱伴う整形症状',
    recommends: [
      { kind: 'lab', text: 'CBC, CRP, ESR, ALP' },
      { kind: 'xray', text: '主訴部位の X-P' },
      { kind: 'note', text: '長期化していれば内科併診検討' },
    ],
  },
  'systemic-numb': {
    id: 'systemic-numb',
    type: 'recommend',
    text: '全身性のしびれ / 倦怠感',
    recommends: [
      { kind: 'lab', text: 'CBC, 血糖, HbA1c, B12, 甲状腺機能, 電解質' },
      { kind: 'note', text: '症状部位応じて MRI 検討' },
      { kind: 'referral', text: '神経内科併診検討' },
    ],
  },
};
