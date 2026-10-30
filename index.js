/**
 * dsh-calculator — 宿主半边
 *
 * 这里**刻意什么都不做**。计算器是纯前端浮层（Ctrl+Q → body 级 DOM 面板），
 * 不需要工具、不需要插槽、不读不写会话。宿主半边存在的唯一理由是：
 * 让这个包在 cordis 插件树上有合法的一行，从而被 dsh-client-modules 扫到，
 * 把 client.js 编进 window.__DSH_BOOT__ 并注入页面。
 *
 * 纪律：apply 绝不抛错、绝不注册服务、绝不改配置 —— 最坏情况是浮层不出现，
 * 绝不能连累宿主启动。
 */

export const name = "dsh-calculator";
export const inject = [];

export function apply(ctx) {
  try {
    if (ctx && typeof ctx.logger === "object" && ctx.logger && typeof ctx.logger.info === "function") {
      ctx.logger.info("[dsh-calculator] 已加载：按 Ctrl+Q 唤出计算器");
    }
  } catch {
    /* 日志失败不影响任何东西 */
  }
  // 什么都不注册：界面完全由 client.js 负责。
  return () => {
    /* 卸载时也不需要清理宿主侧资源 */
  };
}

export default { name, inject, apply };
