// These are screen-space motion descriptions, not contact-surface classifiers.
const visible = p => p && Number.isFinite(p.y) && p.visibility >= .65 && p.y > .02 && p.y < .98;
export function classifyKick(before, after, { foot, direction }, height) {
  const ankle = foot === 'right' ? 28 : 27;
  const unknown = reason => ({ label: '蹴り方の特徴は判別できません', reason, time: null, rise: null });
  if (direction !== 'side') return unknown('足の上がり方を比較するには、固定した横方向の撮影が必要です。');
  if (!before || !after || after.time - before.time < .3 || !Number.isFinite(height) || height < .15 || ![before, after].every(f => visible(f.pose?.[ankle]))) return unknown('蹴る前と蹴り終わりの足元を確認できません。');
  const rise = (before.pose[ankle].y - after.pose[ankle].y) / height;
  if (rise > .08 && rise < .12) return unknown('足の上がり方が暫定の判別境界に近いため、種類を決められません。');
  const high = rise >= .12;
  return {
    label: high ? '蹴り終わりで足が上がる型（動作の候補）' : '低く振り抜く型（動作の候補）',
    reason: `準備候補から蹴り終わり候補まで、蹴り足の足首は画面上で${rise >= 0 ? '上' : '下'}へ身長の目安の約${Math.abs(rise * 100).toFixed(0)}%移動しました。`,
    time: after.time, rise,
    change: high ? '短いパスなら、振り抜きを少し小さくする動作を試し、今の蹴り方と比べてください。足が上がること自体を誤りとは扱いません。' : '今の振り抜きで狙った距離に届くか確かめ、届かない場合だけ振り幅を少し増やして比較してください。',
    drill: '同じ目標へ今の蹴り方で5本、振り幅を変えて5本。到達位置と蹴りやすさを記録し、目的に合う方を選びます。'
  };
}
