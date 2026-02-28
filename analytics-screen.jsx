import { useState, useEffect, useRef } from "react";

const mockData = {
  periods: {
    week: {
      label: "Неделя",
      income: 28500,
      expenses: 14200,
      prevIncome: 24000,
      prevExpenses: 16800,
      chart: [
        { label: "Пн", income: 0, expenses: 1800 },
        { label: "Вт", income: 28500, expenses: 2100 },
        { label: "Ср", income: 0, expenses: 3200 },
        { label: "Чт", income: 0, expenses: 1500 },
        { label: "Пт", income: 0, expenses: 2900 },
        { label: "Сб", income: 0, expenses: 1800 },
        { label: "Вс", income: 0, expenses: 900 },
      ],
    },
    month: {
      label: "Месяц",
      income: 125400,
      expenses: 89200,
      prevIncome: 112000,
      prevExpenses: 93800,
      chart: [
        { label: "1", income: 125400, expenses: 3200 },
        { label: "5", income: 0, expenses: 8900 },
        { label: "10", income: 0, expenses: 12400 },
        { label: "15", income: 0, expenses: 18700 },
        { label: "20", income: 0, expenses: 24100 },
        { label: "25", income: 0, expenses: 31800 },
        { label: "28", income: 0, expenses: 35200 },
      ],
    },
    quarter: {
      label: "Квартал",
      income: 378000,
      expenses: 261400,
      prevIncome: 342000,
      prevExpenses: 278000,
      chart: [
        { label: "Дек", income: 118000, expenses: 84200 },
        { label: "Янв", income: 122000, expenses: 89000 },
        { label: "Фев", income: 138000, expenses: 88200 },
      ],
    },
    year: {
      label: "Год",
      income: 1520000,
      expenses: 1080000,
      prevIncome: 1380000,
      prevExpenses: 1120000,
      chart: [
        { label: "Мар", income: 118000, expenses: 82000 },
        { label: "Июн", income: 124000, expenses: 91000 },
        { label: "Сен", income: 131000, expenses: 88000 },
        { label: "Дек", income: 139000, expenses: 95000 },
        { label: "Мар", income: 128000, expenses: 87000 },
        { label: "Фев", income: 125400, expenses: 89200 },
      ],
    },
  },
  categories: [
    { name: "Жильё", icon: "🏠", amount: 25000, color: "#7C6FFF", percent: 28 },
    { name: "Еда", icon: "🍕", amount: 18400, color: "#4FFFB0", percent: 21 },
    { name: "Транспорт", icon: "🚗", amount: 12800, color: "#FFB84F", percent: 14 },
    { name: "Здоровье", icon: "💊", amount: 9600, color: "#FF6B6B", percent: 11 },
    { name: "Развлечения", icon: "🎮", amount: 8200, color: "#4FC3FF", percent: 9 },
    { name: "Остальное", icon: "📦", amount: 15200, color: "#888", percent: 17 },
  ],
  budgets: [
    { name: "Еда", icon: "🍕", limit: 20000, spent: 18400 },
    { name: "Транспорт", icon: "🚗", limit: 15000, spent: 12800 },
    { name: "Развлечения", icon: "🎮", limit: 8000, spent: 8200 },
    { name: "Здоровье", icon: "💊", limit: 12000, spent: 9600 },
    { name: "Одежда", icon: "👗", limit: 10000, spent: 3200 },
  ],
  goals: [
    { id: 1, name: "Отпуск в Турции", icon: "🏖️", target: 150000, saved: 87500, monthly: 12500, months: 5 },
    { id: 2, name: "Новый MacBook", icon: "💻", target: 200000, saved: 44000, monthly: 18000, months: 9 },
    { id: 3, name: "Подушка безопасности", icon: "🛡️", target: 500000, saved: 212000, monthly: 25000, months: 12 },
  ],
  forecast: {
    daysLeft: 1,
    projectedExpenses: 91400,
    monthlyLimit: 95000,
    dailyBudget: 2200,
    forecastLine: [
      { day: 1, actual: 3200, forecast: null },
      { day: 5, actual: 12100, forecast: null },
      { day: 10, actual: 28800, forecast: null },
      { day: 15, actual: 46500, forecast: null },
      { day: 20, actual: 63200, forecast: null },
      { day: 25, actual: 78900, forecast: null },
      { day: 28, actual: 89200, forecast: 91400 },
    ],
  },
  tips: [
    { id: 1, icon: "💡", text: "Вы тратите на кафе на 30% больше среднего. Сэкономив 3 000 ₽/мес, достигнете цели «Отпуск» на 2 мес раньше." },
    { id: 2, icon: "🎯", text: "В прошлом месяце осталось 8 200 ₽. Перевести их в накопления?", action: true },
  ],
};

const fmt = (n) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(n);

const pct = (a, b) => Math.round(((a - b) / b) * 100);

function AnimatedNumber({ value, duration = 800 }) {
  const [display, setDisplay] = useState(0);
  const start = useRef(0);
  const raf = useRef();

  useEffect(() => {
    start.current = Date.now();
    const tick = () => {
      const progress = Math.min((Date.now() - start.current) / duration, 1);
      const ease = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(value * ease));
      if (progress < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [value, duration]);

  return <>{display.toLocaleString("ru-RU")}</>;
}

function BarChart({ data, period }) {
  const maxVal = Math.max(...data.map((d) => Math.max(d.income, d.expenses)));
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, padding: "0 4px" }}>
      {data.map((d, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
          <div style={{ width: "100%", display: "flex", gap: 2, alignItems: "flex-end", height: 100 }}>
            {d.income > 0 && (
              <div
                style={{
                  flex: 1,
                  height: `${(d.income / maxVal) * 100}%`,
                  background: "linear-gradient(180deg, #4FFFB0, #00D68F)",
                  borderRadius: "3px 3px 0 0",
                  minHeight: 3,
                  transition: "height 0.8s cubic-bezier(.34,1.56,.64,1)",
                  animationDelay: `${i * 60}ms`,
                }}
              />
            )}
            {d.expenses > 0 && (
              <div
                style={{
                  flex: d.income > 0 ? 1 : "unset",
                  width: d.income > 0 ? "auto" : "100%",
                  height: `${(d.expenses / maxVal) * 100}%`,
                  background: "linear-gradient(180deg, #FF6B6B, #E53E3E)",
                  borderRadius: "3px 3px 0 0",
                  minHeight: 3,
                  transition: "height 0.8s cubic-bezier(.34,1.56,.64,1)",
                }}
              />
            )}
          </div>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", fontFamily: "monospace" }}>{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function DonutChart({ categories }) {
  const [active, setActive] = useState(null);
  const total = categories.reduce((s, c) => s + c.percent, 0);
  let cumulative = 0;
  const radius = 52;
  const cx = 70, cy = 70;
  const strokeW = 18;
  const circumference = 2 * Math.PI * radius;

  const segments = categories.map((cat) => {
    const dashArray = (cat.percent / total) * circumference;
    const offset = circumference - cumulative * (circumference / total);
    cumulative += cat.percent;
    return { ...cat, dashArray, offset };
  });

  const activeCat = active !== null ? categories[active] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ position: "relative", flexShrink: 0 }}>
        <svg width={140} height={140} viewBox="0 0 140 140">
          <circle cx={cx} cy={cy} r={radius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={strokeW} />
          {segments.map((seg, i) => (
            <circle
              key={i}
              cx={cx}
              cy={cy}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={active === i ? strokeW + 4 : strokeW}
              strokeDasharray={`${seg.dashArray} ${circumference}`}
              strokeDashoffset={seg.offset}
              strokeLinecap="round"
              style={{ cursor: "pointer", transition: "stroke-width 0.2s", transform: "rotate(-90deg)", transformOrigin: "70px 70px" }}
              onClick={() => setActive(active === i ? null : i)}
            />
          ))}
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          {activeCat ? (
            <>
              <div style={{ fontSize: 18 }}>{activeCat.icon}</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: activeCat.color }}>{activeCat.percent}%</div>
              <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)", textAlign: "center", maxWidth: 50 }}>{activeCat.name}</div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>расходы</div>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#fff" }}>по категориям</div>
            </>
          )}
        </div>
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
        {categories.map((cat, i) => (
          <div
            key={i}
            onClick={() => setActive(active === i ? null : i)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", opacity: active !== null && active !== i ? 0.4 : 1, transition: "opacity 0.2s" }}
          >
            <span style={{ fontSize: 13 }}>{cat.icon}</span>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.7)" }}>{cat.name}</span>
                <span style={{ fontSize: 10, color: cat.color, fontWeight: 600 }}>{cat.percent}%</span>
              </div>
              <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${cat.percent}%`, background: cat.color, borderRadius: 2, transition: "width 1s ease" }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BudgetBar({ item }) {
  const ratio = item.spent / item.limit;
  const color = ratio > 1 ? "#FF6B6B" : ratio > 0.7 ? "#FFB84F" : "#4FFFB0";
  const over = item.spent > item.limit;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>{item.icon}</span>
          <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)", fontFamily: "'DM Sans', sans-serif" }}>{item.name}</span>
        </div>
        <div style={{ textAlign: "right" }}>
          <span style={{ fontSize: 12, color, fontWeight: 700 }}>{fmt(item.spent)}</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.3)" }}> / {fmt(item.limit)}</span>
        </div>
      </div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.min(ratio * 100, 100)}%`, background: color, borderRadius: 3, transition: "width 1s cubic-bezier(.34,1.56,.64,1)", boxShadow: `0 0 8px ${color}80` }} />
      </div>
      {over && (
        <div style={{ marginTop: 5, fontSize: 10, color: "#FF6B6B" }}>⚠️ Превышен на {fmt(item.spent - item.limit)}</div>
      )}
    </div>
  );
}

function GoalCard({ goal }) {
  const ratio = goal.saved / goal.target;
  return (
    <div style={{
      minWidth: 220,
      background: "linear-gradient(135deg, #161E35, #1A1040)",
      border: "1px solid rgba(124,111,255,0.2)",
      borderRadius: 18,
      padding: 18,
      flexShrink: 0,
    }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{goal.icon}</div>
      <div style={{ fontSize: 13, fontWeight: 700, color: "#fff", marginBottom: 2, fontFamily: "'DM Sans', sans-serif" }}>{goal.name}</div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>Цель: {fmt(goal.target)}</div>
      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, marginBottom: 8, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${ratio * 100}%`, background: "linear-gradient(90deg, #7C6FFF, #4FFFB0)", borderRadius: 3, transition: "width 1.2s ease" }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 800, color: "#4FFFB0", fontFamily: "monospace" }}>{fmt(goal.saved)}</span>
        <span style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{Math.round(ratio * 100)}%</span>
      </div>
      <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 12 }}>
        {fmt(goal.monthly)}/мес · ещё {goal.months} мес.
      </div>
      <button style={{
        width: "100%",
        padding: "8px 0",
        background: "rgba(124,111,255,0.15)",
        border: "1px solid rgba(124,111,255,0.3)",
        borderRadius: 10,
        color: "#7C6FFF",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.2s",
        fontFamily: "'DM Sans', sans-serif",
      }}>
        + Пополнить
      </button>
    </div>
  );
}

export default function AnalyticsScreen() {
  const [tab, setTab] = useState("overview");
  const [period, setPeriod] = useState("month");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 50);
    return () => clearTimeout(t);
  }, []);

  const periods = ["week", "month", "quarter", "year"];
  const data = mockData.periods[period];
  const incomeChange = pct(data.income, data.prevIncome);
  const expChange = pct(data.expenses, data.prevExpenses);
  const balance = data.income - data.expenses;
  const forecast = mockData.forecast;

  const tabs = [
    { id: "overview", label: "Обзор" },
    { id: "forecast", label: "Прогноз" },
    { id: "savings", label: "Накопления" },
  ];

  return (
    <div style={{
      width: "100%",
      minHeight: "100vh",
      background: "#090D1A",
      fontFamily: "'DM Sans', sans-serif",
      color: "#fff",
      position: "relative",
      overflowX: "hidden",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=DM+Mono&display=swap');
        ::-webkit-scrollbar { display: none; }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #090D1A; }
        .tab-btn { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.4); font-family: 'DM Sans', sans-serif; font-size: 13px; font-weight: 600; padding: 8px 16px; border-radius: 30px; transition: all 0.25s; white-space: nowrap; }
        .tab-btn.active { background: rgba(255,255,255,0.08); color: #fff; }
        .period-btn { background: none; border: none; cursor: pointer; color: rgba(255,255,255,0.4); font-family: 'DM Sans', sans-serif; font-size: 12px; font-weight: 600; padding: 6px 14px; border-radius: 20px; transition: all 0.25s; }
        .period-btn.active { background: rgba(124,111,255,0.2); color: #7C6FFF; }
        .card { background: #131929; border: 1px solid rgba(255,255,255,0.05); border-radius: 18px; padding: 18px; margin-bottom: 12px; }
        .tip-card { background: linear-gradient(135deg, rgba(79,255,176,0.05), rgba(124,111,255,0.05)); border: 1px solid rgba(79,255,176,0.1); border-radius: 14px; padding: 14px; margin-bottom: 8px; }
        .bottom-nav { display: flex; justify-content: space-around; padding: 12px 0 28px; background: rgba(13,17,32,0.95); backdrop-filter: blur(20px); border-top: 1px solid rgba(255,255,255,0.05); }
        .nav-item { display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer; padding: 4px 12px; }
        .nav-label { font-size: 10px; color: rgba(255,255,255,0.35); }
        .nav-label.active { color: #4FFFB0; }
        .add-goal-btn { width: 100%; padding: 14px; background: rgba(79,255,176,0.08); border: 1.5px dashed rgba(79,255,176,0.25); border-radius: 16px; color: #4FFFB0; font-size: 14px; font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif; transition: all 0.2s; }
        .add-goal-btn:hover { background: rgba(79,255,176,0.14); }
      `}</style>

      {/* Header */}
      <div style={{
        padding: "56px 20px 16px",
        opacity: mounted ? 1 : 0,
        transform: mounted ? "none" : "translateY(-12px)",
        transition: "all 0.5s ease",
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: "-0.5px" }}>Аналитика</h1>
          <div style={{ display: "flex", gap: 10 }}>
            <button style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 12, padding: "8px 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 16 }}>⚙</button>
            <button style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 12, padding: "8px 12px", color: "rgba(255,255,255,0.6)", cursor: "pointer", fontSize: 16 }}>↗</button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{
        display: "flex",
        gap: 4,
        padding: "0 16px 16px",
        overflowX: "auto",
        opacity: mounted ? 1 : 0,
        transition: "opacity 0.5s 0.1s ease",
      }}>
        {tabs.map((t) => (
          <button key={t.id} className={`tab-btn ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div style={{ padding: "0 16px 100px", opacity: mounted ? 1 : 0, transform: mounted ? "none" : "translateY(20px)", transition: "all 0.5s 0.15s ease" }}>

        {/* OVERVIEW TAB */}
        {tab === "overview" && (
          <>
            {/* Period Selector */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div style={{ display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", borderRadius: 24, padding: 4 }}>
                {periods.map((p) => (
                  <button key={p} className={`period-btn ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
                    {mockData.periods[p].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary Card */}
            <div className="card" style={{ background: "linear-gradient(135deg, #131929, #181030)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Доходы</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#4FFFB0", fontFamily: "'DM Mono', monospace", lineHeight: 1.1 }}>
                    +<AnimatedNumber value={data.income} />
                  </div>
                  <div style={{ fontSize: 10, color: incomeChange >= 0 ? "#4FFFB0" : "#FF6B6B", marginTop: 3 }}>
                    {incomeChange >= 0 ? "↑" : "↓"} {Math.abs(incomeChange)}% vs прошлый
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Расходы</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#FF6B6B", fontFamily: "'DM Mono', monospace", lineHeight: 1.1 }}>
                    −<AnimatedNumber value={data.expenses} />
                  </div>
                  <div style={{ fontSize: 10, color: expChange <= 0 ? "#4FFFB0" : "#FF6B6B", marginTop: 3 }}>
                    {expChange >= 0 ? "↑" : "↓"} {Math.abs(expChange)}% vs прошлый
                  </div>
                </div>
              </div>
              <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", marginBottom: 2, textTransform: "uppercase", letterSpacing: "0.5px" }}>Чистый баланс</div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: balance >= 0 ? "#fff" : "#FF6B6B", fontFamily: "'DM Mono', monospace" }}>
                      {balance >= 0 ? "+" : "−"}<AnimatedNumber value={Math.abs(balance)} />  ₽
                    </div>
                  </div>
                  <div style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    background: balance >= 0 ? "rgba(79,255,176,0.1)" : "rgba(255,107,107,0.1)",
                    border: `1.5px solid ${balance >= 0 ? "rgba(79,255,176,0.3)" : "rgba(255,107,107,0.3)"}`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 20,
                  }}>
                    {balance >= 0 ? "📈" : "📉"}
                  </div>
                </div>
              </div>
            </div>

            {/* Bar Chart */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Динамика</span>
                <div style={{ display: "flex", gap: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "#4FFFB0" }} />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Доходы</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 2, background: "#FF6B6B" }} />
                    <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Расходы</span>
                  </div>
                </div>
              </div>
              <BarChart data={data.chart} period={period} />
            </div>

            {/* Donut Chart */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Структура расходов</div>
              <DonutChart categories={mockData.categories} />
            </div>

            {/* Top Categories */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>По категориям</div>
              {mockData.categories.slice(0, 5).map((cat, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 0", borderBottom: i < 4 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: `${cat.color}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                    {cat.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.8)" }}>{cat.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{fmt(cat.amount)}</span>
                    </div>
                    <div style={{ height: 3, background: "rgba(255,255,255,0.07)", borderRadius: 2, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${cat.percent}%`, background: cat.color, borderRadius: 2 }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 11, color: cat.color, fontWeight: 700, minWidth: 30, textAlign: "right" }}>{cat.percent}%</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* FORECAST TAB */}
        {tab === "forecast" && (
          <>
            {/* Forecast Summary */}
            <div className="card" style={{ background: "linear-gradient(135deg, #131929, #1C1020)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px" }}>Прогноз до конца месяца</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#FFB84F", fontFamily: "'DM Mono', monospace" }}>{fmt(forecast.projectedExpenses)}</div>
                </div>
                <div style={{
                  padding: "6px 12px",
                  borderRadius: 20,
                  background: forecast.projectedExpenses < forecast.monthlyLimit ? "rgba(79,255,176,0.1)" : "rgba(255,107,107,0.1)",
                  border: `1px solid ${forecast.projectedExpenses < forecast.monthlyLimit ? "rgba(79,255,176,0.3)" : "rgba(255,107,107,0.3)"}`,
                  fontSize: 11,
                  fontWeight: 600,
                  color: forecast.projectedExpenses < forecast.monthlyLimit ? "#4FFFB0" : "#FF6B6B",
                }}>
                  {forecast.projectedExpenses < forecast.monthlyLimit ? "✓ В норме" : "⚠ Превышение"}
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                {[
                  { label: "Осталось дней", value: forecast.daysLeft, unit: "" },
                  { label: "Лимит месяца", value: fmt(forecast.monthlyLimit), unit: "" },
                  { label: "Бюджет на день", value: fmt(forecast.dailyBudget), unit: "" },
                ].map((item, i) => (
                  <div key={i} style={{ background: "rgba(255,255,255,0.04)", borderRadius: 12, padding: "10px 10px" }}>
                    <div style={{ fontSize: 9, color: "rgba(255,255,255,0.35)", marginBottom: 4, textTransform: "uppercase" }}>{item.label}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{item.value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Forecast progress line */}
            <div className="card">
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Факт vs Прогноз</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", marginBottom: 16 }}>Февраль 2026</div>
              <div style={{ position: "relative", height: 100, marginBottom: 8 }}>
                <div style={{ position: "absolute", top: "40%", left: 0, right: 0, borderTop: "1px dashed rgba(255,107,107,0.4)" }}>
                  <span style={{ position: "absolute", right: 0, top: -14, fontSize: 9, color: "#FF6B6B" }}>Лимит {fmt(forecast.monthlyLimit)}</span>
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: "100%" }}>
                  {forecast.forecastLine.map((p, i) => (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      <div style={{
                        width: "100%",
                        height: `${(p.actual / forecast.monthlyLimit) * 100}%`,
                        background: p.actual > forecast.monthlyLimit ? "rgba(255,107,107,0.7)" : "rgba(124,111,255,0.6)",
                        borderRadius: "3px 3px 0 0",
                        minHeight: 4,
                        position: "relative",
                        border: p.forecast ? "1.5px dashed rgba(255,184,79,0.6)" : "none",
                        boxSizing: "border-box",
                      }} />
                      <span style={{ fontSize: 8, color: "rgba(255,255,255,0.3)", fontFamily: "monospace" }}>{p.day}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 8, borderRadius: 2, background: "rgba(124,111,255,0.6)" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Факт</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 12, height: 8, borderRadius: 2, border: "1.5px dashed rgba(255,184,79,0.6)", background: "transparent" }} />
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>Прогноз</span>
                </div>
              </div>
            </div>

            {/* Budget by category */}
            <div className="card">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Бюджет по категориям</span>
                <button style={{ background: "rgba(124,111,255,0.15)", border: "1px solid rgba(124,111,255,0.3)", borderRadius: 10, padding: "5px 12px", color: "#7C6FFF", fontSize: 11, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>+ Лимит</button>
              </div>
              {mockData.budgets.map((item, i) => (
                <BudgetBar key={i} item={item} />
              ))}
            </div>

            {/* Smart Tips */}
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, paddingLeft: 2 }}>💡 Умные советы</div>
            {mockData.tips.map((tip) => (
              <div key={tip.id} className="tip-card">
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.6 }}>{tip.text}</div>
                {tip.action && (
                  <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                    <button style={{ flex: 1, padding: "8px", background: "rgba(79,255,176,0.15)", border: "1px solid rgba(79,255,176,0.3)", borderRadius: 10, color: "#4FFFB0", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Да, перевести</button>
                    <button style={{ flex: 1, padding: "8px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "rgba(255,255,255,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>Нет</button>
                  </div>
                )}
              </div>
            ))}
          </>
        )}

        {/* SAVINGS TAB */}
        {tab === "savings" && (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Мои цели</div>
            <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 4, marginBottom: 16, marginRight: -16, paddingRight: 16 }}>
              {mockData.goals.map((goal) => (
                <GoalCard key={goal.id} goal={goal} />
              ))}
            </div>

            <button className="add-goal-btn">
              + Новая цель накоплений
            </button>

            {/* Summary Savings */}
            <div className="card" style={{ marginTop: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>Сводка накоплений</div>
              {[
                { label: "Всего накоплено", value: fmt(mockData.goals.reduce((s, g) => s + g.saved, 0)), color: "#4FFFB0" },
                { label: "Всего целей", value: fmt(mockData.goals.reduce((s, g) => s + g.target, 0)), color: "rgba(255,255,255,0.5)" },
                { label: "Ежемесячно откладываю", value: fmt(mockData.goals.reduce((s, g) => s + g.monthly, 0)), color: "#7C6FFF" },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: i < 2 ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <span style={{ fontSize: 13, color: "rgba(255,255,255,0.55)" }}>{item.label}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: item.color, fontFamily: "'DM Mono', monospace" }}>{item.value}</span>
                </div>
              ))}
            </div>

            {/* Smart Tips for savings */}
            <div className="tip-card" style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#4FFFB0", marginBottom: 6 }}>💡 Рекомендация</div>
              <div style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6 }}>
                При текущем темпе вы достигнете всех целей за 12 месяцев. Увеличив ежемесячный взнос на 5 000 ₽, сократите срок до 9 месяцев.
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0 }} className="bottom-nav">
        {[
          { icon: "⌂", label: "Главная" },
          { icon: "⇄", label: "Транзакции" },
          { icon: "▣", label: "Счета" },
          { icon: "◕", label: "Аналитика", active: true },
          { icon: "⚙", label: "Настройки" },
        ].map((item, i) => (
          <div key={i} className="nav-item">
            <span style={{ fontSize: 20, color: item.active ? "#4FFFB0" : "rgba(255,255,255,0.3)" }}>{item.icon}</span>
            <span className={`nav-label ${item.active ? "active" : ""}`}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
