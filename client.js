/**
 * dsh-calculator — 客户端半边
 *
 * Ctrl+Q 唤出一个浮动计算器：
 *   计算页：完整表达式引擎（+ - * / % ^ ! 括号、20+ 函数、变量、ans、百分比智能语义）、
 *           记忆键 M+/M-/MR/MC、历史记录（可点击回填）、结果点击即复制
 *   时间页：秒 / 毫秒 / 分 / 时 / 天 / 周 任意单位输入，一键得到
 *           纯秒 · 纯毫秒 · 纯分钟 · 纯小时 · 纯天 · 时分秒 · 中文口语
 *   存储页：命名变量 + 计算历史 + 时间历史，全部落 localStorage，重启不丢
 *
 * 纪律：不注册任何插槽、不碰官方 DOM、不注入会话消息 —— 纯 body 级浮层，
 *       卸载即彻底消失；任何异常只打一条 warn，绝不影响宿主输入区。
 */
(() => {
  try {
    window.__ModuleLoader__.load({
      id: "dsh-calculator",
      factory: function (require) {
        var module = { exports: {} };
        var exports = module.exports;
        Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

        var PACKAGE_ID = "dsh-calculator";

        /* ============================================================
         * 1. 表达式引擎（tokenizer → AST → eval，不用 eval）
         * ============================================================ */

        function CalcError(message) {
          this.name = "CalcError";
          this.message = message;
        }
        CalcError.prototype = Object.create(Error.prototype);
        CalcError.prototype.constructor = CalcError;

        function fail(msg) {
          throw new CalcError(msg);
        }

        var CONSTS = {
          pi: Math.PI,
          PI: Math.PI,
          e: Math.E,
          tau: Math.PI * 2,
          phi: (1 + Math.sqrt(5)) / 2,
        };

        function factorial(n) {
          if (n < 0 || Math.floor(n) !== n) fail("阶乘只接受非负整数");
          if (n > 170) return Infinity;
          var r = 1;
          for (var i = 2; i <= n; i++) r *= i;
          return r;
        }

        function gcd(a, b) {
          a = Math.abs(Math.round(a));
          b = Math.abs(Math.round(b));
          while (b) {
            var t = a % b;
            a = b;
            b = t;
          }
          return a;
        }

        function toNum(x) {
          return typeof x === "number" ? x : Number(x);
        }

        function sumAll() {
          var s = 0;
          for (var i = 0; i < arguments.length; i++) s += toNum(arguments[i]);
          return s;
        }
        function avgAll() {
          if (!arguments.length) fail("avg 至少需要一个参数");
          return sumAll.apply(null, arguments) / arguments.length;
        }

        var FUNCS = {
          sin: Math.sin, cos: Math.cos, tan: Math.tan,
          asin: Math.asin, acos: Math.acos, atan: Math.atan,
          sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
          asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
          ln: Math.log,
          log: function (x) { return Math.log(x) / Math.LN10; },
          log10: function (x) { return Math.log(x) / Math.LN10; },
          log2: function (x) { return Math.log(x) / Math.LN2; },
          exp: Math.exp,
          sqrt: Math.sqrt,
          cbrt: Math.cbrt,
          abs: Math.abs,
          sign: Math.sign,
          floor: Math.floor,
          ceil: Math.ceil,
          round: Math.round,
          trunc: Math.trunc,
          fact: factorial,
          deg: function (x) { return (x * 180) / Math.PI; },
          rad: function (x) { return (x * Math.PI) / 180; },
          min: Math.min,
          max: Math.max,
          pow: Math.pow,
          hypot: Math.hypot,
          atan2: Math.atan2,
          mod: function (a, b) { return a % b; },
          gcd: gcd,
          lcm: function (a, b) { return Math.abs(a * b) / gcd(a, b) || 0; },
          sum: sumAll,
          avg: avgAll,
          clamp: function (x, lo, hi) { return Math.min(Math.max(x, lo), hi); },
        };

        // 单位后缀：3k / 2.5M / 1G
        var SUFFIX = { k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, w: 1e4, W: 1e4 };

        function normalizeSrc(src) {
          return String(src == null ? "" : src)
            .replace(/[×✕✖*＊]/g, "*")
            .replace(/[÷／]/g, "/")
            .replace(/[−–—－]/g, "-")
            .replace(/[＋]/g, "+")
            .replace(/[（]/g, "(")
            .replace(/[）]/g, ")")
            .replace(/[，、]/g, ",")
            .replace(/[＾]/g, "^")
            .replace(/[！]/g, "!")
            .replace(/[π]/g, "pi")
            .replace(/[％]/g, "%")
            .replace(/[０-９]/g, function (d) { return String.fromCharCode(d.charCodeAt(0) - 0xff10 + 48); })
            .replace(/[＝]/g, "=");
        }

        function isDigit(c) {
          return c >= "0" && c <= "9";
        }

        function tokenize(src) {
          var s = normalizeSrc(src);
          var i = 0;
          var n = s.length;
          var out = [];
          while (i < n) {
            var c = s.charAt(i);
            if (c === " " || c === "\t" || c === "\n" || c === "\r") {
              i++;
              continue;
            }
            if (isDigit(c) || (c === "." && isDigit(s.charAt(i + 1)))) {
              var start = i;
              if (c === "0" && (s.charAt(i + 1) === "x" || s.charAt(i + 1) === "X")) {
                i += 2;
                while (i < n && /[0-9a-fA-F_]/.test(s.charAt(i))) i++;
                out.push({ t: "num", v: parseInt(s.slice(start + 2, i).replace(/_/g, ""), 16) });
                continue;
              }
              if (c === "0" && (s.charAt(i + 1) === "b" || s.charAt(i + 1) === "B")) {
                i += 2;
                while (i < n && /[01_]/.test(s.charAt(i))) i++;
                out.push({ t: "num", v: parseInt(s.slice(start + 2, i).replace(/_/g, ""), 2) });
                continue;
              }
              while (i < n && /[0-9_]/.test(s.charAt(i))) i++;
              if (s.charAt(i) === ".") {
                i++;
                while (i < n && /[0-9_]/.test(s.charAt(i))) i++;
              }
              if (s.charAt(i) === "e" || s.charAt(i) === "E") {
                var j = i + 1;
                if (s.charAt(j) === "+" || s.charAt(j) === "-") j++;
                if (isDigit(s.charAt(j))) {
                  i = j;
                  while (i < n && isDigit(s.charAt(i))) i++;
                }
              }
              out.push({ t: "num", v: parseFloat(s.slice(start, i).replace(/_/g, "")) });
              continue;
            }
            if (/[A-Za-z_\u4e00-\u9fa5]/.test(c)) {
              var st = i;
              while (i < n && /[A-Za-z0-9_\u4e00-\u9fa5]/.test(s.charAt(i))) i++;
              out.push({ t: "id", v: s.slice(st, i) });
              continue;
            }
            if ("+-*/%^()!,".indexOf(c) >= 0) {
              out.push({ t: "op", v: c });
              i++;
              continue;
            }
            if (c === "=") {
              out.push({ t: "op", v: "=" });
              i++;
              continue;
            }
            fail("无法识别的字符「" + c + "」");
          }
          out.push({ t: "end", v: "" });
          return out;
        }

        function Parser(tokens) {
          this.ts = tokens;
          this.i = 0;
        }

        Parser.prototype.peek = function (k) {
          return this.ts[Math.min(this.i + (k || 0), this.ts.length - 1)];
        };
        Parser.prototype.next = function () {
          return this.ts[this.i++];
        };
        Parser.prototype.isOp = function (v, k) {
          var t = this.peek(k);
          return t.t === "op" && t.v === v;
        };
        Parser.prototype.expectOp = function (v) {
          if (!this.isOp(v)) fail("缺少「" + v + "」");
          this.next();
        };

        function startsValue(tok) {
          if (!tok) return false;
          if (tok.t === "num") return true;
          if (tok.t === "id") return true;
          return false;
        }

        Parser.prototype.parseAssign = function () {
          var a = this.peek();
          var b = this.peek(1);
          if (a.t === "id" && b.t === "op" && b.v === "=") {
            this.next();
            this.next();
            var value = this.parseAdd();
            return { k: "assign", name: a.v, a: value };
          }
          return this.parseAdd();
        };

        Parser.prototype.parseAdd = function () {
          var left = this.parseMul();
          for (;;) {
            if (this.isOp("+") || this.isOp("-")) {
              var op = this.next().v;
              var right = this.parseMul();
              left = { k: "bin", op: op, a: left, b: right };
              continue;
            }
            break;
          }
          return left;
        };

        Parser.prototype.parseMul = function () {
          var left = this.parseUnary();
          for (;;) {
            if (this.isOp("*") || this.isOp("/")) {
              var op = this.next().v;
              var right = this.parseUnary();
              left = { k: "bin", op: op, a: left, b: right };
              continue;
            }
            if (this.isOp("%")) {
              // 后面还跟着一个值 → 取模；否则 → 百分比
              var after = this.peek(1);
              if (startsValue(after)) {
                this.next();
                left = { k: "bin", op: "%", a: left, b: this.parseUnary() };
                continue;
              }
              this.next();
              left = { k: "pct", a: left };
              continue;
            }
            // 隐式乘法：2(3+4)、2pi、3sqrt(9)
            if (startsValue(this.peek()) || this.isOp("(")) {
              var rhs = this.parseUnary();
              left = { k: "bin", op: "*", a: left, b: rhs };
              continue;
            }
            break;
          }
          return left;
        };

        Parser.prototype.parseUnary = function () {
          if (this.isOp("-")) {
            this.next();
            return { k: "un", op: "-", a: this.parseUnary() };
          }
          if (this.isOp("+")) {
            this.next();
            return this.parseUnary();
          }
          return this.parsePow();
        };

        Parser.prototype.parsePow = function () {
          var base = this.parsePostfix();
          if (this.isOp("^")) {
            this.next();
            return { k: "bin", op: "^", a: base, b: this.parseUnary() };
          }
          return base;
        };

        Parser.prototype.parsePostfix = function () {
          var node = this.parsePrimary();
          for (;;) {
            if (this.isOp("!")) {
              this.next();
              node = { k: "call", name: "fact", args: [node] };
              continue;
            }
            break;
          }
          return node;
        };

        Parser.prototype.parsePrimary = function () {
          var tok = this.next();
          if (tok.t === "num") {
            var v = tok.v;
            // 3k / 2.5M
            var suf = this.peek();
            if (suf.t === "id" && suf.v.length === 1 && Object.prototype.hasOwnProperty.call(SUFFIX, suf.v)) {
              this.next();
              v = v * SUFFIX[suf.v];
            }
            return { k: "num", v: v };
          }
          if (tok.t === "id") {
            if (this.isOp("(")) {
              this.next();
              var args = [];
              if (!this.isOp(")")) {
                for (;;) {
                  args.push(this.parseAdd());
                  if (this.isOp(",")) {
                    this.next();
                    continue;
                  }
                  break;
                }
              }
              this.expectOp(")");
              return { k: "call", name: tok.v, args: args };
            }
            return { k: "var", name: tok.v };
          }
          if (tok.t === "op" && tok.v === "(") {
            var inner = this.parseAdd();
            this.expectOp(")");
            return inner;
          }
          if (tok.t === "end") fail("表达式不完整");
          fail("这里不该出现「" + tok.v + "」");
        };

        function parseExpression(src) {
          var p = new Parser(tokenize(src));
          var ast = p.parseAssign();
          if (p.peek().t !== "end") {
            fail("多余的「" + p.peek().v + "」");
          }
          return ast;
        }

        function evalNode(node, scope) {
          switch (node.k) {
            case "num":
              return node.v;
            case "var": {
              var name = node.name;
              if (Object.prototype.hasOwnProperty.call(scope.vars, name)) return scope.vars[name];
              if (Object.prototype.hasOwnProperty.call(CONSTS, name)) return CONSTS[name];
              var lower = name.toLowerCase();
              if (Object.prototype.hasOwnProperty.call(CONSTS, lower)) return CONSTS[lower];
              if (name === "ans") return scope.ans || 0;
              if (name === "mem" || name === "M") return scope.mem || 0;
              if (Object.prototype.hasOwnProperty.call(FUNCS, name)) fail("「" + name + "」是函数，后面要跟括号");
              fail("未知变量「" + name + "」");
              break;
            }
            case "un":
              return -evalNode(node.a, scope);
            case "pct":
              return evalNode(node.a, scope) / 100;
            case "call": {
              var fn = FUNCS[node.name];
              if (typeof fn !== "function") {
                if (Object.prototype.hasOwnProperty.call(FUNCS, node.name.toLowerCase())) {
                  fn = FUNCS[node.name.toLowerCase()];
                } else {
                  fail("未知函数「" + node.name + "」");
                }
              }
              var argv = [];
              for (var i = 0; i < node.args.length; i++) argv.push(evalNode(node.args[i], scope));
              var r = fn.apply(null, argv);
              if (typeof r !== "number") fail("函数「" + node.name + "」返回了非数值");
              return r;
            }
            case "bin": {
              var a = evalNode(node.a, scope);
              var b = evalNode(node.b, scope);
              switch (node.op) {
                case "+":
                  // 智能百分比：200+10% → 220
                  if (node.b.k === "pct") return a + a * b;
                  return a + b;
                case "-":
                  if (node.b.k === "pct") return a - a * b;
                  return a - b;
                case "*":
                  return a * b;
                case "/":
                  if (b === 0) fail("除数为零");
                  return a / b;
                case "%":
                  if (b === 0) fail("取模的除数为零");
                  return a % b;
                case "^":
                  return Math.pow(a, b);
              }
              fail("未知运算符「" + node.op + "」");
              break;
            }
            case "assign":
              return evalNode(node.a, scope);
          }
          fail("表达式无法求值");
        }

        /**
         * 求值。scope: { vars:{}, ans:number, mem:number }
         * 返回 { value, assigned } —— assigned 是赋值语句里的变量名（没赋值就是 null）
         */
        function evaluate(src, scope) {
          var ast = parseExpression(src);
          var value = evalNode(ast, scope);
          if (typeof value !== "number" || Number.isNaN(value)) {
            fail("结果不是有效数值");
          }
          return { value: value, assigned: ast.k === "assign" ? ast.name : null };
        }

        /* ============================================================
         * 2. 数字格式化
         * ============================================================ */

        function fmtNum(n) {
          if (typeof n !== "number") return String(n);
          if (Number.isNaN(n)) return "NaN";
          if (!isFinite(n)) return n > 0 ? "∞" : "-∞";
          if (n === 0) return "0";
          var a = Math.abs(n);
          if (a >= 1e16 || a < 1e-9) {
            return n
              .toExponential(9)
              .replace(/\.?0+e/, "e")
              .replace("e+", "e");
          }
          var r = Number(n.toPrecision(12));
          return String(r);
        }

        function fmtGrouped(n) {
          var s = fmtNum(n);
          if (s.indexOf("e") >= 0 || s === "∞" || s === "-∞" || s === "NaN") return s;
          var neg = s.charAt(0) === "-";
          if (neg) s = s.slice(1);
          var parts = s.split(".");
          parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
          return (neg ? "-" : "") + parts.join(".");
        }

        /* ============================================================
         * 3. 时间换算
         * ============================================================ */

        var UNIT_SECONDS = {
          ms: 0.001, 毫秒: 0.001, milli: 0.001, millis: 0.001,
          s: 1, 秒: 1, sec: 1, secs: 1, second: 1, seconds: 1,
          m: 60, 分: 60, 分钟: 60, min: 60, mins: 60, minute: 60, minutes: 60,
          h: 3600, 时: 3600, 小时: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600,
          d: 86400, 天: 86400, 日: 86400, day: 86400, days: 86400,
          w: 604800, 周: 604800, 星期: 604800, week: 604800, weeks: 604800,
        };

        // 长的写在前面，正则交替按顺序匹配
        var UNIT_ALT =
          "毫秒|分钟|小时|星期|millis|milli|seconds|second|minutes|minute|hours|hour|weeks|week|days|day|mins|min|hrs|hr|secs|sec|ms|秒|分|时|天|日|周|s|m|h|d|w";

        function unitFactor(unit) {
          if (!unit) return null;
          var u = String(unit).trim();
          if (Object.prototype.hasOwnProperty.call(UNIT_SECONDS, u)) return UNIT_SECONDS[u];
          var lower = u.toLowerCase();
          if (Object.prototype.hasOwnProperty.call(UNIT_SECONDS, lower)) return UNIT_SECONDS[lower];
          return null;
        }

        /**
         * 解析时间输入 → 秒数。
         * 支持：90 / 90s / 90 秒 / 1:30 / 1:02:03 / 2h30m / 1天2小时3分4秒 / -5m
         * defaultFactor：纯数字时当作什么单位（默认 1 = 秒）
         */
        function parseTimeInput(text, defaultFactor) {
          var raw = String(text == null ? "" : text).trim();
          if (!raw) return null;
          var src = normalizeSrc(raw).trim();

          var sign = 1;
          if (src.charAt(0) === "-") {
            sign = -1;
            src = src.slice(1).trim();
          } else if (src.charAt(0) === "+") {
            src = src.slice(1).trim();
          }
          if (!src) return null;

          // 1) 冒号式：H:MM:SS / M:SS
          var colon = src.match(/^(?:(\d+(?:\.\d+)?):)?(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);
          if (colon) {
            var h = colon[1] === undefined ? 0 : parseFloat(colon[1]);
            var mi = parseFloat(colon[2]);
            var se = parseFloat(colon[3]);
            return sign * (h * 3600 + mi * 60 + se);
          }

          // 2) 单一「数字+单位」
          var single = src.match(/^(\d+(?:\.\d+)?)\s*([A-Za-z\u4e00-\u9fa5]+)$/);
          if (single) {
            var f = unitFactor(single[2]);
            if (f === null) fail("不认识的单位「" + single[2] + "」");
            return sign * parseFloat(single[1]) * f;
          }

          // 3) 复合：2h30m / 1天2小时3分4秒
          var re = new RegExp("(\\d+(?:\\.\\d+)?)\\s*(" + UNIT_ALT + ")", "gi");
          var total = 0;
          var consumed = 0;
          var mm;
          while ((mm = re.exec(src)) !== null) {
            var factor = unitFactor(mm[2]);
            if (factor === null) fail("不认识的单位「" + mm[2] + "」");
            total += parseFloat(mm[1]) * factor;
            consumed += mm[0].length;
          }
          var leftover = src.replace(re, "").replace(/[\s,+，、]+/g, "");
          if (consumed > 0 && leftover === "") return sign * total;

          // 4) 纯数字
          if (/^\d+(?:\.\d+)?$/.test(src)) {
            var df = typeof defaultFactor === "number" && isFinite(defaultFactor) ? defaultFactor : 1;
            return sign * parseFloat(src) * df;
          }

          fail("看不懂这个时间格式");
        }

        function pad2(n) {
          return n < 10 ? "0" + n : String(n);
        }

        /**
         * 秒 → 各种表示
         */
        function timeBreakdown(seconds) {
          var neg = seconds < 0;
          var a = Math.abs(seconds);

          var days = Math.floor(a / 86400);
          var hours = Math.floor((a % 86400) / 3600);
          var minutes = Math.floor((a % 3600) / 60);
          var secs = a - days * 86400 - hours * 3600 - minutes * 60;

          var secText = secs === Math.floor(secs) ? String(secs) : String(Number(secs.toFixed(3)));

          var hms =
            (days > 0 ? days + "天 " : "") +
            pad2(days > 0 ? hours : Math.floor(a / 3600)) +
            ":" +
            pad2(minutes) +
            ":" +
            (secs < 10 ? "0" : "") +
            secText;

          var parts = [];
          if (days > 0) parts.push(days + "天");
          if (hours > 0) parts.push(hours + "小时");
          if (minutes > 0) parts.push(minutes + "分");
          if (secs > 0 || parts.length === 0) parts.push(secText + "秒");
          var cn = parts.join("");
          if (neg) cn = "负" + cn;
          if (neg) hms = "-" + hms;

          return {
            seconds: seconds,
            milliseconds: seconds * 1000,
            minutes: seconds / 60,
            hours: seconds / 3600,
            days: seconds / 86400,
            weeks: seconds / 604800,
            hms: hms,
            cn: cn,
            days_part: days,
            hours_part: hours,
            minutes_part: minutes,
            seconds_part: secs,
          };
        }

        /* ============================================================
         * 4. 状态持久化
         * ============================================================ */

        var STORE_KEY = "dsh-calculator:v1";
        var HISTORY_LIMIT = 60;

        function freshState() {
          return {
            tab: "calc",
            expr: "",
            result: "",
            resultRaw: null,
            error: "",
            vars: {},
            history: [],
            timeInput: "",
            timeUnit: "auto",
            timeRows: null,
            timeHistory: [],
            mem: 0,
            ans: 0,
            pos: null,
          };
        }

        function loadState() {
          var s = freshState();
          try {
            var raw = window.localStorage.getItem(STORE_KEY);
            if (!raw) return s;
            var saved = JSON.parse(raw);
            if (!saved || typeof saved !== "object") return s;
            if (typeof saved.tab === "string") s.tab = saved.tab;
            if (saved.vars && typeof saved.vars === "object") s.vars = saved.vars;
            if (Array.isArray(saved.history)) s.history = saved.history.slice(0, HISTORY_LIMIT);
            if (Array.isArray(saved.timeHistory)) s.timeHistory = saved.timeHistory.slice(0, 20);
            if (typeof saved.timeUnit === "string") s.timeUnit = saved.timeUnit;
            if (typeof saved.mem === "number" && isFinite(saved.mem)) s.mem = saved.mem;
            if (typeof saved.ans === "number" && isFinite(saved.ans)) s.ans = saved.ans;
            if (saved.pos && typeof saved.pos.left === "number" && typeof saved.pos.top === "number") s.pos = saved.pos;
          } catch (e) {
            /* 存档损坏就当新开 */
          }
          return s;
        }

        var state = null;
        var saveTimer = null;

        function saveStateSoon() {
          if (saveTimer) clearTimeout(saveTimer);
          saveTimer = setTimeout(function () {
            saveTimer = null;
            try {
              window.localStorage.setItem(
                STORE_KEY,
                JSON.stringify({
                  tab: state.tab,
                  vars: state.vars,
                  history: state.history,
                  timeHistory: state.timeHistory,
                  timeUnit: state.timeUnit,
                  mem: state.mem,
                  ans: state.ans,
                  pos: state.pos,
                }),
              );
            } catch (e) {
              /* 存储满了就算了，不影响使用 */
            }
          }, 200);
        }

        /* ============================================================
         * 5. 样式
         * ============================================================ */

        var CSS = [
          "#dsh-calc-root{position:fixed;inset:0;z-index:2147483600;display:none;pointer-events:none}",
          "#dsh-calc-root[data-open='1']{display:block}",
          "#dsh-calc-panel{position:absolute;width:432px;max-height:78vh;display:flex;flex-direction:column;",
          "pointer-events:auto;border-radius:14px;overflow:hidden;",
          "background:var(--dsw-alias-bg-base,#fff);color:var(--dsw-alias-label-pri,#1b1c20);",
          "border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.12));",
          "box-shadow:0 18px 50px rgba(0,0,0,.28),0 2px 8px rgba(0,0,0,.12);",
          "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif;font-size:13px}",
          "body[data-ds-dark-theme] #dsh-calc-panel{background:#1e1f24;color:#e8e9ed;border-color:rgba(255,255,255,.14)}",
          "#dsh-calc-head{display:flex;align-items:center;gap:8px;padding:9px 10px 9px 12px;cursor:move;user-select:none;",
          "background:linear-gradient(180deg,rgba(99,102,241,.10),rgba(99,102,241,0));border-bottom:1px solid rgba(127,127,127,.18)}",
          "#dsh-calc-head .dsh-calc-title{font-weight:600;font-size:12.5px;letter-spacing:.3px;white-space:nowrap}",
          "#dsh-calc-head .dsh-calc-tabs{display:flex;gap:2px;margin-left:6px}",
          "#dsh-calc-head .dsh-calc-tab{border:0;background:transparent;color:inherit;opacity:.6;font:inherit;font-size:12px;",
          "padding:3px 9px;border-radius:7px;cursor:pointer}",
          "#dsh-calc-head .dsh-calc-tab[data-active='1']{opacity:1;background:rgba(99,102,241,.16);font-weight:600}",
          "#dsh-calc-head .dsh-calc-tab:hover{opacity:1}",
          "#dsh-calc-close{margin-left:auto;border:0;background:transparent;color:inherit;opacity:.55;cursor:pointer;",
          "font-size:16px;line-height:1;padding:2px 6px;border-radius:6px}",
          "#dsh-calc-close:hover{opacity:1;background:rgba(239,68,68,.15)}",
          "#dsh-calc-body{overflow:auto;padding:12px 14px 14px}",
          "#dsh-calc-body::-webkit-scrollbar{width:8px}",
          "#dsh-calc-body::-webkit-scrollbar-thumb{background:rgba(127,127,127,.35);border-radius:4px}",
          ".dsh-calc-sec{display:none}.dsh-calc-sec[data-active='1']{display:block}",
          ".dsh-calc-input{width:100%;box-sizing:border-box;border:1px solid rgba(127,127,127,.3);border-radius:9px;",
          "background:rgba(127,127,127,.07);color:inherit;font-family:ui-monospace,SFMono-Regular,Consolas,monospace;",
          "font-size:15px;padding:9px 11px;outline:none}",
          ".dsh-calc-input:focus{border-color:rgba(99,102,241,.7);box-shadow:0 0 0 3px rgba(99,102,241,.15)}",
          "#dsh-calc-out{margin-top:10px;padding:10px 12px;border-radius:10px;background:rgba(99,102,241,.08);",
          "font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:24px;font-weight:600;",
          "word-break:break-all;cursor:pointer;min-height:24px;line-height:1.25;position:relative}",
          "#dsh-calc-out[data-state='error']{background:rgba(239,68,68,.1);color:#e5484d;font-size:13px;font-weight:500}",
          "#dsh-calc-out[data-state='empty']{opacity:.4;font-size:14px;font-weight:400}",
          "#dsh-calc-out .dsh-calc-copy{position:absolute;right:8px;bottom:6px;font-size:10px;opacity:.45;font-weight:400}",
          ".dsh-calc-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px;align-items:center}",
          ".dsh-calc-btn{border:1px solid rgba(127,127,127,.3);background:rgba(127,127,127,.08);color:inherit;font:inherit;",
          "font-size:12px;padding:4px 10px;border-radius:7px;cursor:pointer;white-space:nowrap}",
          ".dsh-calc-btn:hover{border-color:rgba(99,102,241,.6);background:rgba(99,102,241,.12)}",
          ".dsh-calc-btn[data-active='1']{border-color:rgba(99,102,241,.75);background:rgba(99,102,241,.18);font-weight:600}",
          ".dsh-calc-hint{margin-top:9px;font-size:11px;opacity:.5;line-height:1.6}",
          ".dsh-calc-list{margin-top:10px;display:flex;flex-direction:column;gap:1px}",
          ".dsh-calc-item{display:flex;gap:8px;align-items:baseline;padding:5px 7px;border-radius:6px;cursor:pointer;",
          "font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px}",
          ".dsh-calc-item:hover{background:rgba(99,102,241,.1)}",
          ".dsh-calc-item .e{opacity:.62;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0}",
          ".dsh-calc-item .v{font-weight:600;white-space:nowrap}",
          ".dsh-calc-item .x{opacity:.35;font-size:14px;line-height:1;padding:0 2px;border:0;background:transparent;color:inherit;cursor:pointer}",
          ".dsh-calc-item .x:hover{opacity:1;color:#e5484d}",
          ".dsh-calc-trow{display:flex;justify-content:space-between;gap:12px;padding:7px 9px;border-radius:7px;cursor:pointer;",
          "font-size:12.5px;border-bottom:1px solid rgba(127,127,127,.1)}",
          ".dsh-calc-trow:hover{background:rgba(99,102,241,.1)}",
          ".dsh-calc-trow .k{opacity:.62;white-space:nowrap}",
          ".dsh-calc-trow .v{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:600;text-align:right;word-break:break-all}",
          ".dsh-calc-empty{opacity:.42;font-size:12px;padding:14px 4px;text-align:center}",
          ".dsh-calc-title-row{display:flex;align-items:center;justify-content:space-between;margin-top:14px;margin-bottom:2px}",
          ".dsh-calc-title-row .t{font-size:11.5px;opacity:.55;letter-spacing:.4px}",
          "#dsh-calc-toast{position:absolute;left:50%;bottom:14px;transform:translateX(-50%) translateY(6px);",
          "background:rgba(30,30,36,.92);color:#fff;font-size:12px;padding:6px 14px;border-radius:20px;",
          "opacity:0;transition:opacity .16s ease,transform .16s ease;pointer-events:none;white-space:nowrap}",
          "#dsh-calc-toast[data-show='1']{opacity:1;transform:translateX(-50%) translateY(0)}",
        ].join("\n");

        /* ============================================================
         * 6. DOM
         * ============================================================ */

        var root = null;
        var panel = null;
        var bodyEl = null;
        var exprEl = null;
        var outEl = null;
        var timeEl = null;
        var toastEl = null;
        var refs = {};
        var mounted = false;

        function h(tag, cls, text) {
          var n = document.createElement(tag);
          if (cls) n.className = cls;
          if (text !== undefined && text !== null) n.textContent = String(text);
          return n;
        }

        function toast(msg) {
          if (!toastEl) return;
          toastEl.textContent = msg;
          toastEl.setAttribute("data-show", "1");
          clearTimeout(toastEl.__t);
          toastEl.__t = setTimeout(function () {
            toastEl.setAttribute("data-show", "0");
          }, 1200);
        }

        function copyText(text) {
          var s = String(text);
          var done = function () {
            toast("已复制 " + (s.length > 28 ? s.slice(0, 28) + "…" : s));
          };
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(s).then(done, function () { fallbackCopy(s, done); });
              return;
            }
          } catch (e) {
            /* 落到兜底 */
          }
          fallbackCopy(s, done);
        }

        function fallbackCopy(s, done) {
          try {
            var ta = document.createElement("textarea");
            ta.value = s;
            ta.style.position = "fixed";
            ta.style.left = "-9999px";
            document.body.appendChild(ta);
            ta.select();
            document.execCommand("copy");
            document.body.removeChild(ta);
            done();
          } catch (e) {
            toast("复制失败，请手动选");
          }
        }

        function mount() {
          if (mounted) return;
          mounted = true;

          var style = document.createElement("style");
          style.setAttribute("data-plugin-css", PACKAGE_ID);
          style.textContent = CSS;
          document.head.appendChild(style);

          root = document.createElement("div");
          root.id = "dsh-calc-root";
          root.setAttribute("data-plugin", PACKAGE_ID);

          panel = h("div");
          panel.id = "dsh-calc-panel";

          // ---- 头部 ----
          var head = h("div");
          head.id = "dsh-calc-head";
          head.appendChild(h("span", "dsh-calc-title", "计算器"));
          var tabs = h("div", "dsh-calc-tabs");
          var tabDefs = [
            ["calc", "计算"],
            ["time", "时间"],
            ["store", "存储"],
          ];
          for (var i = 0; i < tabDefs.length; i++) {
            (function (id, label) {
              var b = h("button", "dsh-calc-tab", label);
              b.type = "button";
              b.setAttribute("data-tab", id);
              b.addEventListener("click", function (ev) {
                ev.stopPropagation();
                state.tab = id;
                saveStateSoon();
                renderTabs();
              });
              tabs.appendChild(b);
            })(tabDefs[i][0], tabDefs[i][1]);
          }
          head.appendChild(tabs);
          var closeBtn = h("button", "", "×");
          closeBtn.id = "dsh-calc-close";
          closeBtn.type = "button";
          closeBtn.title = "关闭 (Esc)";
          closeBtn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            close();
          });
          head.appendChild(closeBtn);
          panel.appendChild(head);

          // ---- 主体 ----
          bodyEl = h("div");
          bodyEl.id = "dsh-calc-body";

          // 计算页
          var secCalc = h("section", "dsh-calc-sec");
          secCalc.setAttribute("data-sec", "calc");
          exprEl = h("input", "dsh-calc-input");
          exprEl.type = "text";
          exprEl.placeholder = "输入表达式，例如 (1+2)*3 或 200*15% 或 sqrt(2)";
          exprEl.spellcheck = false;
          exprEl.autocomplete = "off";
          exprEl.addEventListener("input", function () {
            state.expr = exprEl.value;
            liveEval();
          });
          exprEl.addEventListener("keydown", function (ev) {
            if (ev.key === "Enter") {
              ev.preventDefault();
              commitEval();
            } else if (ev.key === "ArrowUp" && state.history.length) {
              ev.preventDefault();
              recallHistory(1);
            } else if (ev.key === "ArrowDown") {
              ev.preventDefault();
              recallHistory(-1);
            }
          });
          secCalc.appendChild(exprEl);

          outEl = h("div");
          outEl.id = "dsh-calc-out";
          outEl.addEventListener("click", function () {
            if (state.resultRaw !== null) copyText(state.resultRaw);
          });
          secCalc.appendChild(outEl);

          var memRow = h("div", "dsh-calc-row");
          var memDefs = [
            ["MC", "清空记忆", function () { state.mem = 0; saveStateSoon(); liveEval(); toast("记忆已清空"); }],
            ["MR", "读出记忆", function () { insertText(fmtNum(state.mem)); }],
            ["M+", "记忆加当前结果", function () { state.mem += state.resultRaw === null ? 0 : state.resultRaw; saveStateSoon(); toast("M = " + fmtNum(state.mem)); }],
            ["M-", "记忆减当前结果", function () { state.mem -= state.resultRaw === null ? 0 : state.resultRaw; saveStateSoon(); toast("M = " + fmtNum(state.mem)); }],
            ["ans", "上一次结果", function () { insertText("ans"); }],
            ["清空", "清空输入", function () { state.expr = ""; exprEl.value = ""; liveEval(); }],
          ];
          for (var m = 0; m < memDefs.length; m++) {
            (function (label, tip, fn) {
              var b = h("button", "dsh-calc-btn", label);
              b.type = "button";
              b.title = tip;
              b.addEventListener("click", fn);
              memRow.appendChild(b);
            })(memDefs[m][0], memDefs[m][1], memDefs[m][2]);
          }
          secCalc.appendChild(memRow);

          secCalc.appendChild(
            h(
              "div",
              "dsh-calc-hint",
              "Enter 计算并存历史 · ↑↓ 翻历史 · 支持 + - * / ^ % ! 括号、sin cos tan ln log sqrt abs round min max gcd、常量 pi e、变量 x=5、3k/2.5M 简写",
            ),
          );

          var hTitle = h("div", "dsh-calc-title-row");
          hTitle.appendChild(h("span", "t", "历史"));
          var hClear = h("button", "dsh-calc-btn", "清空");
          hClear.type = "button";
          hClear.addEventListener("click", function () {
            state.history = [];
            saveStateSoon();
            renderCalcHistory();
          });
          hTitle.appendChild(hClear);
          secCalc.appendChild(hTitle);
          refs.calcHistory = h("div", "dsh-calc-list");
          secCalc.appendChild(refs.calcHistory);
          bodyEl.appendChild(secCalc);
          refs.secCalc = secCalc;

          // 时间页
          var secTime = h("section", "dsh-calc-sec");
          secTime.setAttribute("data-sec", "time");
          timeEl = h("input", "dsh-calc-input");
          timeEl.type = "text";
          timeEl.placeholder = "90 / 1:30 / 2h30m / 1天2小时3分4秒";
          timeEl.spellcheck = false;
          timeEl.autocomplete = "off";
          timeEl.addEventListener("input", function () {
            state.timeInput = timeEl.value;
            runTime();
          });
          secTime.appendChild(timeEl);

          refs.timeChips = h("div", "dsh-calc-row");
          var chipDefs = [
            ["auto", "自动"],
            ["1", "秒"],
            ["60", "分"],
            ["3600", "小时"],
            ["86400", "天"],
          ];
          for (var c = 0; c < chipDefs.length; c++) {
            (function (id, label) {
              var b = h("button", "dsh-calc-btn", label);
              b.type = "button";
              b.setAttribute("data-unit", id);
              b.addEventListener("click", function () {
                state.timeUnit = id;
                saveStateSoon();
                renderTimeUnitChips();
                runTime();
              });
              refs.timeChips.appendChild(b);
            })(chipDefs[c][0], chipDefs[c][1]);
          }
          secTime.appendChild(refs.timeChips);

          refs.timeOut = h("div", "dsh-calc-list");
          secTime.appendChild(refs.timeOut);
          secTime.appendChild(
            h(
              "div",
              "dsh-calc-hint",
              "点任意一行复制 · 「自动」时纯数字按秒算，选「分/小时/天」则按该单位算 · 复合写法 2h30m 与 1:02:03 都认",
            ),
          );
          bodyEl.appendChild(secTime);
          refs.secTime = secTime;

          // 存储页
          var secStore = h("section", "dsh-calc-sec");
          secStore.setAttribute("data-sec", "store");
          var vTitle = h("div", "dsh-calc-title-row");
          vTitle.appendChild(h("span", "t", "变量"));
          var vClear = h("button", "dsh-calc-btn", "全清");
          vClear.type = "button";
          vClear.addEventListener("click", function () {
            state.vars = {};
            saveStateSoon();
            renderStore();
          });
          vTitle.appendChild(vClear);
          secStore.appendChild(vTitle);
          refs.vars = h("div", "dsh-calc-list");
          secStore.appendChild(refs.vars);

          var mTitle = h("div", "dsh-calc-title-row");
          mTitle.appendChild(h("span", "t", "记忆 M"));
          var mReset = h("button", "dsh-calc-btn", "归零");
          mReset.type = "button";
          mReset.addEventListener("click", function () {
            state.mem = 0;
            saveStateSoon();
            renderStore();
          });
          mTitle.appendChild(mReset);
          secStore.appendChild(mTitle);
          refs.memView = h("div", "dsh-calc-list");
          secStore.appendChild(refs.memView);

          var tTitle = h("div", "dsh-calc-title-row");
          tTitle.appendChild(h("span", "t", "时间换算历史"));
          var tClear = h("button", "dsh-calc-btn", "清空");
          tClear.type = "button";
          tClear.addEventListener("click", function () {
            state.timeHistory = [];
            saveStateSoon();
            renderStore();
          });
          tTitle.appendChild(tClear);
          secStore.appendChild(tTitle);
          refs.timeHist = h("div", "dsh-calc-list");
          secStore.appendChild(refs.timeHist);
          bodyEl.appendChild(secStore);
          refs.secStore = secStore;

          panel.appendChild(bodyEl);

          toastEl = h("div");
          toastEl.id = "dsh-calc-toast";
          panel.appendChild(toastEl);

          root.appendChild(panel);
          document.body.appendChild(root);

          installDrag(head);
          renderAll();
        }

        function installDrag(head) {
          var dragging = false;
          var sx = 0;
          var sy = 0;
          var sl = 0;
          var st = 0;

          head.addEventListener("mousedown", function (ev) {
            if (ev.button !== 0) return;
            if (ev.target && ev.target.closest && ev.target.closest("button")) return;
            var rect = panel.getBoundingClientRect();
            dragging = true;
            sx = ev.clientX;
            sy = ev.clientY;
            sl = rect.left;
            st = rect.top;
            ev.preventDefault();
          });

          document.addEventListener("mousemove", function (ev) {
            if (!dragging) return;
            var nl = Math.max(4, Math.min(window.innerWidth - 80, sl + ev.clientX - sx));
            var nt = Math.max(4, Math.min(window.innerHeight - 40, st + ev.clientY - sy));
            panel.style.left = nl + "px";
            panel.style.top = nt + "px";
            panel.style.right = "auto";
          });

          document.addEventListener("mouseup", function () {
            if (!dragging) return;
            dragging = false;
            var rect = panel.getBoundingClientRect();
            state.pos = { left: Math.round(rect.left), top: Math.round(rect.top) };
            saveStateSoon();
          });
        }

        function applyPos() {
          if (!panel) return;
          var p = state.pos;
          var left;
          var top;
          if (p) {
            left = Math.min(Math.max(4, p.left), Math.max(4, window.innerWidth - 120));
            top = Math.min(Math.max(4, p.top), Math.max(4, window.innerHeight - 80));
          } else {
            left = Math.max(12, window.innerWidth - 460);
            top = 92;
          }
          panel.style.left = left + "px";
          panel.style.top = top + "px";
          panel.style.right = "auto";
        }

        /* ============================================================
         * 7. 渲染
         * ============================================================ */

        function renderTabs() {
          if (!panel) return;
          var btns = panel.querySelectorAll(".dsh-calc-tab");
          for (var i = 0; i < btns.length; i++) {
            btns[i].setAttribute("data-active", btns[i].getAttribute("data-tab") === state.tab ? "1" : "0");
          }
          var secs = panel.querySelectorAll(".dsh-calc-sec");
          for (var j = 0; j < secs.length; j++) {
            secs[j].setAttribute("data-active", secs[j].getAttribute("data-sec") === state.tab ? "1" : "0");
          }
        }

        function renderTimeUnitChips() {
          if (!refs.timeChips) return;
          var kids = refs.timeChips.children;
          for (var i = 0; i < kids.length; i++) {
            kids[i].setAttribute("data-active", kids[i].getAttribute("data-unit") === state.timeUnit ? "1" : "0");
          }
        }

        function renderOut() {
          if (!outEl) return;
          outEl.innerHTML = "";
          if (state.error) {
            outEl.setAttribute("data-state", "error");
            outEl.textContent = state.error;
            return;
          }
          if (state.result === "") {
            outEl.setAttribute("data-state", "empty");
            outEl.textContent = "输入表达式开始算";
            return;
          }
          outEl.setAttribute("data-state", "ok");
          outEl.textContent = state.result;
          outEl.appendChild(h("span", "dsh-calc-copy", "点击复制"));
        }

        function renderCalcHistory() {
          if (!refs.calcHistory) return;
          refs.calcHistory.innerHTML = "";
          if (!state.history.length) {
            refs.calcHistory.appendChild(h("div", "dsh-calc-empty", "还没有记录"));
            return;
          }
          for (var i = 0; i < state.history.length; i++) {
            (function (item, idx) {
              var row = h("div", "dsh-calc-item");
              row.title = "点击回填";
              row.appendChild(h("span", "e", item.expr));
              row.appendChild(h("span", "v", item.display));
              var del = h("button", "x", "×");
              del.type = "button";
              del.title = "删除这条";
              del.addEventListener("click", function (ev) {
                ev.stopPropagation();
                state.history.splice(idx, 1);
                saveStateSoon();
                renderCalcHistory();
              });
              row.appendChild(del);
              row.addEventListener("click", function () {
                insertText(item.expr, true);
              });
              refs.calcHistory.appendChild(row);
            })(state.history[i], i);
          }
        }

        function renderTime() {
          if (!refs.timeOut) return;
          refs.timeOut.innerHTML = "";
          var b = state.timeRows;
          if (!b) {
            refs.timeOut.appendChild(h("div", "dsh-calc-empty", state.error || "输入一个时间开始换算"));
            return;
          }
          var rows = [
            ["纯秒", fmtNum(b.seconds) + " s"],
            ["纯毫秒", fmtNum(b.milliseconds) + " ms"],
            ["纯分钟", fmtNum(b.minutes) + " min"],
            ["纯小时", fmtNum(b.hours) + " h"],
            ["纯天", fmtNum(b.days) + " d"],
            ["纯周", fmtNum(b.weeks) + " w"],
            ["时分秒", b.hms],
            ["中文", b.cn],
          ];
          for (var i = 0; i < rows.length; i++) {
            (function (k, v) {
              var row = h("div", "dsh-calc-trow");
              row.appendChild(h("span", "k", k));
              row.appendChild(h("span", "v", v));
              row.addEventListener("click", function () {
                copyText(v);
              });
              refs.timeOut.appendChild(row);
            })(rows[i][0], rows[i][1]);
          }
        }

        function renderStore() {
          if (!refs.vars) return;
          refs.vars.innerHTML = "";
          var names = Object.keys(state.vars);
          if (!names.length) {
            refs.vars.appendChild(h("div", "dsh-calc-empty", "还没有变量。在计算页输入 x=5 就能存一个"));
          } else {
            for (var i = 0; i < names.length; i++) {
              (function (name) {
                var row = h("div", "dsh-calc-item");
                row.appendChild(h("span", "e", name + " ="));
                row.appendChild(h("span", "v", fmtGrouped(state.vars[name])));
                var del = h("button", "x", "×");
                del.type = "button";
                del.addEventListener("click", function (ev) {
                  ev.stopPropagation();
                  delete state.vars[name];
                  saveStateSoon();
                  renderStore();
                });
                row.appendChild(del);
                row.addEventListener("click", function () {
                  insertText(name);
                });
                refs.vars.appendChild(row);
              })(names[i]);
            }
          }

          refs.memView.innerHTML = "";
          var memRow = h("div", "dsh-calc-item");
          memRow.appendChild(h("span", "e", "M ="));
          memRow.appendChild(h("span", "v", fmtGrouped(state.mem)));
          memRow.addEventListener("click", function () {
            insertText(fmtNum(state.mem));
          });
          refs.memView.appendChild(memRow);

          refs.timeHist.innerHTML = "";
          var hist = state.timeHistory || [];
          if (!hist.length) {
            refs.timeHist.appendChild(h("div", "dsh-calc-empty", "还没有换算记录"));
          } else {
            for (var j = 0; j < hist.length; j++) {
              (function (item) {
                var row = h("div", "dsh-calc-item");
                row.appendChild(h("span", "e", item.input));
                row.appendChild(h("span", "v", item.hms));
                row.addEventListener("click", function () {
                  state.timeInput = item.input;
                  if (timeEl) timeEl.value = item.input;
                  state.tab = "time";
                  saveStateSoon();
                  renderTabs();
                  runTime();
                });
                refs.timeHist.appendChild(row);
              })(hist[j]);
            }
          }
        }

        function renderAll() {
          if (!mounted) return;
          renderTabs();
          renderTimeUnitChips();
          if (exprEl) exprEl.value = state.expr || "";
          if (timeEl) timeEl.value = state.timeInput || "";
          renderOut();
          renderCalcHistory();
          renderTime();
          renderStore();
          applyPos();
        }

        /* ============================================================
         * 8. 交互逻辑
         * ============================================================ */

        function scopeOf() {
          return { vars: state.vars, ans: state.ans || 0, mem: state.mem };
        }

        function liveEval() {
          var src = String(state.expr || "").trim();
          state.error = "";
          if (!src) {
            state.result = "";
            state.resultRaw = null;
            renderOut();
            return;
          }
          try {
            var r = evaluate(src, scopeOf());
            state.result = fmtGrouped(r.value);
            state.resultRaw = r.value;
          } catch (e) {
            state.error = e && e.message ? e.message : "算式有误";
            state.result = "";
            state.resultRaw = null;
          }
          renderOut();
        }

        function commitEval() {
          var src = String(state.expr || "").trim();
          if (!src) return;
          try {
            var r = evaluate(src, scopeOf());
            state.ans = r.value;
            state.result = fmtGrouped(r.value);
            state.resultRaw = r.value;
            state.error = "";
            if (r.assigned) state.vars[r.assigned] = r.value;
            state.history.unshift({ expr: src, display: fmtGrouped(r.value) });
            if (state.history.length > HISTORY_LIMIT) state.history.length = HISTORY_LIMIT;
            saveStateSoon();
            renderOut();
            renderCalcHistory();
            renderStore();
            if (r.assigned) toast("已存 " + r.assigned + " = " + fmtGrouped(r.value));
          } catch (e) {
            state.error = e && e.message ? e.message : "算式有误";
            state.result = "";
            state.resultRaw = null;
            renderOut();
          }
        }

        var historyCursor = -1;

        function recallHistory(dir) {
          if (!state.history.length) return;
          historyCursor += dir;
          if (historyCursor < 0) historyCursor = 0;
          if (historyCursor >= state.history.length) {
            historyCursor = -1;
            state.expr = "";
            exprEl.value = "";
            liveEval();
            return;
          }
          state.expr = state.history[historyCursor].expr;
          exprEl.value = state.expr;
          exprEl.setSelectionRange(exprEl.value.length, exprEl.value.length);
          liveEval();
        }

        function insertText(text, replace) {
          if (!exprEl) return;
          var v = String(text);
          if (replace) {
            state.expr = v;
            exprEl.value = v;
          } else {
            var start = exprEl.selectionStart === null ? state.expr.length : exprEl.selectionStart;
            var end = exprEl.selectionEnd === null ? state.expr.length : exprEl.selectionEnd;
            var cur = exprEl.value || "";
            state.expr = cur.slice(0, start) + v + cur.slice(end);
            exprEl.value = state.expr;
            var pos = start + v.length;
            exprEl.setSelectionRange(pos, pos);
          }
          historyCursor = -1;
          state.tab = "calc";
          renderTabs();
          exprEl.focus();
          liveEval();
        }

        function runTime() {
          var src = String(state.timeInput || "").trim();
          state.error = "";
          if (!src) {
            state.timeRows = null;
            renderTime();
            return;
          }
          var factor = state.timeUnit === "auto" ? 1 : parseFloat(state.timeUnit);
          try {
            var secs = parseTimeInput(src, factor);
            if (secs === null) {
              state.timeRows = null;
              renderTime();
              return;
            }
            state.timeRows = timeBreakdown(secs);
            var hist = state.timeHistory || (state.timeHistory = []);
            var found = -1;
            for (var i = 0; i < hist.length; i++) {
              if (hist[i].input === src) {
                found = i;
                break;
              }
            }
            if (found >= 0) hist.splice(found, 1);
            hist.unshift({ input: src, hms: state.timeRows.hms, seconds: state.timeRows.seconds });
            if (hist.length > 20) hist.length = 20;
            saveStateSoon();
            renderTime();
            renderStore();
          } catch (e) {
            state.timeRows = null;
            state.error = e && e.message ? e.message : "时间格式看不懂";
            renderTime();
          }
        }

        /* ============================================================
         * 9. 开关 & 全局快捷键
         * ============================================================ */

        var isOpen = false;

        function open() {
          mount();
          isOpen = true;
          root.setAttribute("data-open", "1");
          applyPos();
          renderTabs();
          renderTimeUnitChips();
          if (state.tab === "time" && timeEl) {
            timeEl.focus();
            timeEl.select();
          } else if (exprEl) {
            exprEl.focus();
            exprEl.select();
          }
        }

        function close() {
          if (!root) return;
          isOpen = false;
          root.setAttribute("data-open", "0");
        }

        function toggle() {
          if (isOpen) close();
          else open();
        }

        function onKeyDown(ev) {
          var key = ev.key || "";
          // Ctrl+Q：全局唤出 / 收起
          if (
            (ev.ctrlKey || ev.metaKey) &&
            !ev.altKey &&
            !ev.shiftKey &&
            (key === "q" || key === "Q" || ev.code === "KeyQ")
          ) {
            ev.preventDefault();
            ev.stopPropagation();
            toggle();
            return;
          }
          if (!isOpen) return;
          if (key === "Escape") {
            ev.preventDefault();
            ev.stopPropagation();
            close();
          }
        }

        function apply(ctx) {
          if (window.__dshCalculatorInstalled) return;
          window.__dshCalculatorInstalled = true;
          state = loadState();
          document.addEventListener("keydown", onKeyDown, true);
          window.addEventListener("resize", function () {
            if (isOpen) applyPos();
          });
          try {
            console.log("[dsh-calculator] 已就绪：Ctrl+Q 唤出计算器");
          } catch (e) {
            /* 忽略 */
          }
        }

        exports.name = PACKAGE_ID;
        exports.inject = [];
        exports.apply = apply;
        exports.__internals = {
          CalcError: CalcError,
          tokenize: tokenize,
          parseExpression: parseExpression,
          evaluate: evaluate,
          fmtNum: fmtNum,
          fmtGrouped: fmtGrouped,
          parseTimeInput: parseTimeInput,
          timeBreakdown: timeBreakdown,
          UNIT_SECONDS: UNIT_SECONDS,
        };

        return module.exports;
      },
    });
  } catch (err) {
    console.warn("[AI Client Sandbox] dsh-calculator runtime error:", err);
  }
})();
