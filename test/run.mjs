// dsh-calculator 的引擎自测：纯 Node 跑，不需要浏览器。
// 用法：node test/run.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "client.js"), "utf8");

// 在假的 window/document 里把 client.js 跑起来，抓 __internals
const sandbox = { exports: null };
const fakeWindow = {
  __ModuleLoader__: {
    load({ factory }) {
      sandbox.exports = factory((id) => {
        if (id === "react") return {};
        return {};
      });
    },
  },
  localStorage: {
    _d: {},
    getItem(k) {
      return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
    },
    setItem(k, v) {
      this._d[k] = String(v);
    },
  },
  addEventListener() {},
  innerWidth: 1600,
  innerHeight: 900,
};
const fakeDocument = {
  head: { appendChild() {} },
  body: { appendChild() {} },
  createElement() {
    return {
      style: {},
      classList: { add() {}, remove() {} },
      setAttribute() {},
      appendChild() {},
      addEventListener() {},
      setAttributeNS() {},
    };
  },
  addEventListener() {},
  getElementById() {
    return null;
  },
};

const runner = new Function("window", "document", "console", "navigator", src);
runner(fakeWindow, fakeDocument, { log() {}, warn() {}, error() {} }, {});

const api = sandbox.exports && sandbox.exports.__internals;
if (!api) {
  console.error("✗ 没能从 client.js 里取到 __internals");
  process.exit(1);
}

const { evaluate, parseTimeInput, timeBreakdown, fmtGrouped } = api;

let pass = 0;
let failCount = 0;
const failures = [];

function eq(label, actual, expected) {
  const ok = Object.is(actual, expected) || (typeof actual === "number" && typeof expected === "number" && Math.abs(actual - expected) < 1e-9);
  if (ok) {
    pass++;
  } else {
    failCount++;
    failures.push(`${label}: 期望 ${expected}，实际 ${actual}`);
  }
}

function calc(expr, vars = {}) {
  const scope = { vars: { ...vars }, ans: 0, mem: 0 };
  return evaluate(expr, scope).value;
}

function throws(label, fn) {
  try {
    fn();
    failCount++;
    failures.push(`${label}: 期望抛错，实际没抛`);
  } catch {
    pass++;
  }
}

/* ---------- 基础四则 ---------- */
eq("1+1", calc("1+1"), 2);
eq("2*3+4", calc("2*3+4"), 10);
eq("2+3*4", calc("2+3*4"), 14);
eq("(2+3)*4", calc("(2+3)*4"), 20);
eq("10/4", calc("10/4"), 2.5);
eq("2^10", calc("2^10"), 1024);
eq("2^3^2", calc("2^3^2"), 512);
eq("-5+3", calc("-5+3"), -2);
eq("--5", calc("--5"), 5);
eq("5!", calc("5!"), 120);
eq("10%5", calc("10%5"), 0);
eq("7%3", calc("7%3"), 1);
eq("200*15%", calc("200*15%"), 30);
eq("200+10%", calc("200+10%"), 220);
eq("200-10%", calc("200-10%"), 180);

/* ---------- 隐式乘法 / 简写 ---------- */
eq("2(3+4)", calc("2(3+4)"), 14);
eq("3k", calc("3k"), 3000);
eq("2.5M", calc("2.5M"), 2500000);
eq("1w", calc("1w"), 10000);

/* ---------- 函数 ---------- */
eq("sqrt(16)", calc("sqrt(16)"), 4);
eq("abs(-7)", calc("abs(-7)"), 7);
eq("max(1,9,5)", calc("max(1,9,5)"), 9);
eq("min(1,9,5)", calc("min(1,9,5)"), 1);
eq("round(2.6)", calc("round(2.6)"), 3);
eq("floor(-1.2)", calc("floor(-1.2)"), -2);
eq("gcd(12,18)", calc("gcd(12,18)"), 6);
eq("lcm(4,6)", calc("lcm(4,6)"), 12);
eq("sum(1,2,3)", calc("sum(1,2,3)"), 6);
eq("avg(2,4,6)", calc("avg(2,4,6)"), 4);
eq("log(100)", calc("log(100)"), 2);
eq("log2(8)", calc("log2(8)"), 3);
eq("exp(0)", calc("exp(0)"), 1);
eq("hypot(3,4)", calc("hypot(3,4)"), 5);
eq("clamp(15,0,10)", calc("clamp(15,0,10)"), 10);
eq("pow(2,8)", calc("pow(2,8)"), 256);
eq("sin(0)", calc("sin(0)"), 0);
eq("pi", calc("pi"), Math.PI);

/* ---------- 变量 / 赋值 ---------- */
eq("x=5 求值", calc("x=5"), 5);
{
  const scope = { vars: {}, ans: 0, mem: 0 };
  const r = evaluate("x=5", scope);
  eq("x=5 assigned", r.assigned, "x");
}
eq("变量代入", calc("x*2", { x: 5 }), 10);
eq("ans 默认 0", calc("ans+1"), 1);

/* ---------- 错误 ---------- */
throws("除零", () => calc("1/0"));
throws("未知变量", () => calc("abc"));
throws("括号不闭合", () => calc("(1+2"));
throws("未知函数", () => calc("foo(1)"));
throws("负阶乘", () => calc("(-3)!"));
throws("小数阶乘", () => calc("2.5!"));

/* ---------- 中文/全角符号 ---------- */
eq("全角括号", calc("（1＋2）×3"), 9);
eq("全角数字", calc("１２３＋１"), 124);
eq("乘号 ×", calc("6×7"), 42);
eq("除号 ÷", calc("8÷2"), 4);

/* ---------- 时间解析 ---------- */
eq("纯数字默认秒", parseTimeInput("90", 1), 90);
eq("90 秒", parseTimeInput("90秒", 1), 90);
eq("90s", parseTimeInput("90s", 1), 90);
eq("2 分钟", parseTimeInput("2分钟", 1), 120);
eq("2m", parseTimeInput("2m", 1), 120);
eq("1.5h", parseTimeInput("1.5h", 1), 5400);
eq("1:30", parseTimeInput("1:30", 1), 90);
eq("1:02:03", parseTimeInput("1:02:03", 1), 3723);
eq("0:00:05", parseTimeInput("0:00:05", 1), 5);
eq("2h30m", parseTimeInput("2h30m", 1), 9000);
eq("1天2小时3分4秒", parseTimeInput("1天2小时3分4秒", 1), 86400 + 7200 + 180 + 4);
eq("纯数字按分算", parseTimeInput("90", 60), 5400);
eq("纯数字按小时算", parseTimeInput("2", 3600), 7200);
eq("负数 -5m", parseTimeInput("-5m", 1), -300);
eq("毫秒 500ms", parseTimeInput("500ms", 1), 0.5);
throws("乱写时间", () => parseTimeInput("哈哈", 1));

/* ---------- 时间拆解 ---------- */
{
  const b = timeBreakdown(3723);
  eq("3723 秒", b.seconds, 3723);
  eq("3723 分", b.minutes, 62.05);
  eq("3723 时", b.hours, 3723 / 3600);
  eq("3723 时分秒", b.hms, "01:02:03");
  eq("3723 中文", b.cn, "1小时2分3秒");
}
{
  const b = timeBreakdown(90);
  eq("90 时分秒", b.hms, "00:01:30");
  eq("90 中文", b.cn, "1分30秒");
}
{
  const b = timeBreakdown(3661.5);
  eq("3661.5 时分秒", b.hms, "01:01:01.5");
}
{
  const b = timeBreakdown(90061);
  eq("90061 含天", b.hms, "1天 01:01:01");
  eq("90061 中文", b.cn, "1天1小时1分1秒");
}
{
  const b = timeBreakdown(0);
  eq("0 时分秒", b.hms, "00:00:00");
  eq("0 中文", b.cn, "0秒");
}
{
  const b = timeBreakdown(86400);
  eq("86400 纯天", b.days, 1);
}

/* ---------- 格式化 ---------- */
eq("fmt 大数分组", fmtGrouped(1234567), "1,234,567");
eq("fmt 小数", fmtGrouped(2.5), "2.5");
eq("fmt 0", fmtGrouped(0), "0");

/* ---------- 汇总 ---------- */
console.log(`\n通过 ${pass} 项，失败 ${failCount} 项`);
if (failCount) {
  console.log("\n失败明细：");
  for (const f of failures) console.log("  ✗ " + f);
  process.exit(1);
} else {
  console.log("✓ 全部通过");
}
