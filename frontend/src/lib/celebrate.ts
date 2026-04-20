/**
 * 庆祝动效 —— 在关键业务事件（线索转客户、PI 批准、订单达成…）时
 * 撒一把彩带，给用户一点"做成了"的温度。
 *
 * 保持轻量：canvas-confetti 本身就是一个 fire-and-forget 函数，
 * 这里额外用 prefers-reduced-motion 做无动画降级。
 */

let loaded: any = null;

/** 触发一次中等强度的撒彩带 */
export function celebrate(opts?: { emoji?: string }): void {
  if (typeof window === 'undefined') return;

  const mql = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (mql?.matches) return;

  const run = (confetti: any) => {
    // 先在屏幕中央下方爆一下，形成扇形向上
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { x: 0.5, y: 0.7 },
      scalar: 1.1,
    });
    // 稍延迟从两侧再补两小簇，让效果更丰满
    setTimeout(() => {
      confetti({
        particleCount: 40,
        angle: 60,
        spread: 60,
        origin: { x: 0, y: 0.8 },
      });
      confetti({
        particleCount: 40,
        angle: 120,
        spread: 60,
        origin: { x: 1, y: 0.8 },
      });
    }, 200);
  };

  if (loaded) {
    run(loaded);
    return;
  }
  import('canvas-confetti')
    .then((mod) => {
      loaded = mod.default ?? mod;
      run(loaded);
    })
    .catch(() => {
      /* 动效丢了也不应影响主流程 */
    });
}
