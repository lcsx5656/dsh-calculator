// 冒烟测试：模拟模块加载器 + 最小 DOM，验证 apply() 不抛错、
// Ctrl+Q 能开关面板、Esc 能关、裸 q 不触发、样式注入到位、无告警。
//
// 注意：client.js 的开关状态是 <div id="dsh-calc-root" data-open="0|1">，
// 面板尺寸/层级全在注入的 CSS 里（不在 inline style 上），断言要照这个来。
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "..", "client.js"), "utf8");

/* ---------- 极简 DOM ---------- */
let nodeSeq = 0;
function makeEl(tag) {
  const el = {
    tagName: String(tag || "div").toUpperCase(),
    id: "",
    className: "",
    textContent: "",
    innerHTML: "",
    value: "",
    type: "",
    style: {},
    dataset: {},
    children: [],
    parentNode: null,
    _attrs: {},
    _listeners: {},
    setAttribute(k, v) {
      this._attrs[k] = String(v);
      if (k === "id") this.id = String(v);
      if (k === "class") this.className = String(v);
    },
    getAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k) ? this._attrs[k] : null;
    },
    hasAttribute(k) {
      return Object.prototype.hasOwnProperty.call(this._attrs, k);
    },
    removeAttribute(k) {
      delete this._attrs[k];
    },
    appendChild(c) {
      c.parentNode = this;
      this.children.push(c);
      return c;
    },
    removeChild(c) {
      const i = this.children.indexOf(c);
      if (i >= 0) this.children.splice(i, 1);
      c.parentNode = null;
      return c;
    },
    insertBefore(c, ref) {
      const i = this.children.indexOf(ref);
      c.parentNode = this;
      this.children.splice(i < 0 ? this.children.length : i, 0, c);
      return c;
    },
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    },
    addEventListener(t, fn) {
      (this._listeners[t] = this._listeners[t] || []).push(fn);
    },
    removeEventListener(t, fn) {
      const a = this._listeners[t];
      if (a) {
        const i = a.indexOf(fn);
        if (i >= 0) a.splice(i, 1);
      }
    },
    dispatch(t, ev) {
      for (const fn of this._listeners[t] || []) fn(ev);
    },
    querySelector() {
      return null;
    },
    querySelectorAll() {
      return [];
    },
    focus() {},
    blur() {},
    select() {},
    click() {},
    getBoundingClientRect() {
      return { left: 0, top: 0, right: 432, bottom: 500, width: 432, height: 500 };
    },
    get firstChild() {
      return this.children[0] || null;
    },
    get lastChild() {
      return this.children[this.children.length - 1] || null;
    },
    get classList() {
      const self = this;
      return {
        add(c) {
          const s = new Set(String(self.className).split(/\s+/).filter(Boolean));
          s.add(c);
          self.className = [...s].join(" ");
        },
        remove(c) {
          const s = new Set(String(self.className).split(/\s+/).filter(Boolean));
          s.delete(c);
          self.className = [...s].join(" ");
        },
        contains(c) {
          return String(self.className).split(/\s+/).includes(c);
        },
        toggle(c) {
          this.contains(c) ? this.remove(c) : this.add(c);
        },
      };
    },
    _uid: ++nodeSeq,
  };
  return el;
}

const head = makeEl("head");
const body = makeEl("body");
const docListeners = {};
const winListeners = {};

const fakeDocument = {
  head,
  body,
  documentElement: makeEl("html"),
  createElement: makeEl,
  createTextNode(t) {
    const e = makeEl("#text");
    e.textContent = String(t);
    return e;
  },
  createElementNS(ns, tag) {
    return makeEl(tag);
  },
  getElementById(id) {
    const walk = (n) => {
      if (n.id === id) return n;
      for (const c of n.children) {
        const r = walk(c);
        if (r) return r;
      }
      return null;
    };
    return walk(body) || walk(head);
  },
  querySelector() {
    return null;
  },
  querySelectorAll() {
    return [];
  },
  addEventListener(t, fn) {
    (docListeners[t] = docListeners[t] || []).push(fn);
  },
  removeEventListener(t, fn) {
    const a = docListeners[t];
    if (a) {
      const i = a.indexOf(fn);
      if (i >= 0) a.splice(i, 1);
    }
  },
};

const fakeStorage = {
  _d: {},
  getItem(k) {
    return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null;
  },
  setItem(k, v) {
    this._d[k] = String(v);
  },
  removeItem(k) {
    delete this._d[k];
  },
};

const warnings = [];
const fakeWindow = {
  __ModuleLoader__: {
    load({ factory }) {
      fakeWindow.__mod = factory((id) => (id === "react" || id === "react-dom" ? {} : {}));
    },
  },
  localStorage: fakeStorage,
  addEventListener(t, fn) {
    (winListeners[t] = winListeners[t] || []).push(fn);
  },
  removeEventListener() {},
  innerWidth: 1600,
  innerHeight: 900,
  devicePixelRatio: 1,
};

const runner = new Function("window", "document", "console", "navigator", "setTimeout", "clearTimeout", src);
runner(fakeWindow, fakeDocument, { log() {}, warn: (...a) => warnings.push(a.join(" ")), error() {} }, {}, setTimeout, clearTimeout);

let pass = 0;
const bad = [];
function ok(label, cond, extra) {
  if (cond) pass++;
  else bad.push(label + (extra ? ` (${extra})` : ""));
}

/* ---------- 1. 模块导出 ---------- */
const mod = fakeWindow.__mod;
ok("factory 返回了 exports", !!mod);
ok("exports.name 正确", mod && mod.name === "dsh-calculator", mod && mod.name);
ok("exports.apply 是函数", mod && typeof mod.apply === "function");
ok("exports.inject 是空数组", Array.isArray(mod.inject) && mod.inject.length === 0);

/* ---------- 2. apply 不抛错 ---------- */
let applyThrew = null;
try {
  mod.apply({});
} catch (e) {
  applyThrew = e;
}
ok("apply({}) 不抛错", applyThrew === null, applyThrew && applyThrew.message);

/* ---------- 3. 监听器已挂 ---------- */
ok(
  "document 上挂了 keydown 捕获",
  Array.isArray(docListeners.keydown) && docListeners.keydown.length > 0,
  JSON.stringify(Object.keys(docListeners))
);

/* ---------- 4. Ctrl+Q 唤出 ---------- */
function fireKey(init) {
  const ev = {
    key: init.key || "",
    code: init.code || "",
    ctrlKey: !!init.ctrlKey,
    metaKey: !!init.metaKey,
    altKey: !!init.altKey,
    shiftKey: !!init.shiftKey,
    target: body,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {},
    stopImmediatePropagation() {},
  };
  for (const fn of docListeners.keydown || []) fn(ev);
  return ev;
}

function openState() {
  const r = fakeDocument.getElementById("dsh-calc-root");
  if (!r) return null;
  return r.getAttribute("data-open");
}

ok("初始没有浮层", fakeDocument.getElementById("dsh-calc-root") === null);

const ev1 = fireKey({ key: "q", code: "KeyQ", ctrlKey: true });
const root = fakeDocument.getElementById("dsh-calc-root");
ok("Ctrl+Q 建出了 #dsh-calc-root", !!root);
ok("Ctrl+Q 阻止了默认行为", ev1.defaultPrevented === true);
ok("Ctrl+Q 后 data-open=1", openState() === "1", String(openState()));

const panel = fakeDocument.getElementById("dsh-calc-panel");
ok("建出了 #dsh-calc-panel", !!panel);

/* ---------- 5. 再按一次收起 ---------- */
fireKey({ key: "q", code: "KeyQ", ctrlKey: true });
ok("再按 Ctrl+Q 收起（data-open=0）", openState() === "0", String(openState()));

/* ---------- 6. 不带修饰键不触发 ---------- */
const before = openState();
const evPlain = fireKey({ key: "q", code: "KeyQ" });
ok("裸 q 不切换状态", openState() === before, `${before} -> ${openState()}`);
ok("裸 q 不阻止默认行为", evPlain.defaultPrevented === false);

/* ---------- 7. Esc 关闭 ---------- */
fireKey({ key: "q", code: "KeyQ", ctrlKey: true });
ok("再次打开", openState() === "1", String(openState()));
const evEsc = fireKey({ key: "Escape", code: "Escape" });
ok("Esc 能关掉", openState() === "0", String(openState()));
ok("Esc 阻止了默认行为", evEsc.defaultPrevented === true);

/* ---------- 8. Cmd+Q（mac 习惯）也认 ---------- */
fireKey({ key: "q", code: "KeyQ", metaKey: true });
ok("Meta+Q 也能打开", openState() === "1", String(openState()));
fireKey({ key: "Escape", code: "Escape" });

/* ---------- 9. 带 Shift 不抢（避免误触） ---------- */
fireKey({ key: "Q", code: "KeyQ", ctrlKey: true, shiftKey: true });
ok("Ctrl+Shift+Q 不触发", openState() === "0", String(openState()));

/* ---------- 10. 重复 apply 不炸（防重入） ---------- */
let twiceThrew = null;
const keydownCountBefore = (docListeners.keydown || []).length;
try {
  mod.apply({});
} catch (e) {
  twiceThrew = e;
}
ok("重复 apply 不抛错", twiceThrew === null, twiceThrew && twiceThrew.message);
ok(
  "重复 apply 不重复挂监听",
  (docListeners.keydown || []).length === keydownCountBefore,
  `${keydownCountBefore} -> ${(docListeners.keydown || []).length}`
);

/* ---------- 11. 样式注入 ---------- */
const styleTags = head.children.filter((c) => c.tagName === "STYLE");
ok("注入了 <style>", styleTags.length > 0, "style 数 " + styleTags.length);
ok("style 带 data-plugin-css 标记", styleTags.some((s) => s.getAttribute("data-plugin-css") === "dsh-calculator"));
const cssText = styleTags.map((s) => String(s.textContent || "")).join("\n");
ok("CSS 里有 #dsh-calc-panel", cssText.includes("#dsh-calc-panel"));
ok("CSS 里面板宽 432px", cssText.includes("width:432px"));
ok("CSS 里 z-index 2147483600", cssText.includes("2147483600"));
ok("CSS 里有 data-open 开关规则", cssText.includes("#dsh-calc-root[data-open='1']"));
ok("CSS 里有暗色主题覆盖", cssText.includes("data-ds-dark-theme"));
ok("CSS 里有页签样式", cssText.includes(".dsh-calc-tab"));
ok("CSS 里有分页显隐规则", cssText.includes(".dsh-calc-sec[data-active='1']"));

/* ---------- 12. 无意外告警 ---------- */
ok("运行期没有 console.warn", warnings.length === 0, warnings.join(" | "));

/* ---------- 汇总 ---------- */
console.log(`\n冒烟测试：通过 ${pass} 项，失败 ${bad.length} 项`);
if (bad.length) {
  console.log("\n失败明细：");
  for (const b of bad) console.log("  ✗ " + b);
  process.exit(1);
} else {
  console.log("✓ 全部通过");
}
