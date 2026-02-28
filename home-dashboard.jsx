import { useState, useEffect, useRef } from "react";

const Icon = ({ name, size = 20, color = "currentColor" }) => {
  const icons = {
    eye: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>,
    eyeOff: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>,
    plus: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
    edit: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
    trash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>,
    home: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
    card: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
    cash: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/></svg>,
    car: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 17H3a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2l2-4h8l2 4h2a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2h-2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>,
    savings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a10 10 0 1 0 10 10H12V2z"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>,
    flag: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>,
    trending: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>,
    x: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
    bell: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>,
  };
  return icons[name] || null;
};

const INITIAL_ACCOUNTS = [
  { id: 1, name: "Основной",  icon: "card",    color: "#4FC3FF", balance: 87450 },
  { id: 2, name: "Наличные",  icon: "cash",    color: "#4FFFB0", balance: 12600 },
  { id: 3, name: "Машина",    icon: "car",     color: "#FFB84F", balance: 0     },
  { id: 4, name: "Дом",       icon: "home",    color: "#7C6FFF", balance: 25405 },
];

const INITIAL_GOALS = [
  { id: 1, name: "Отпуск", emoji: "🏖️", target: 150000, saved: 87500,  color: "#4FC3FF" },
  { id: 2, name: "MacBook", emoji: "💻", target: 200000, saved: 44000,  color: "#7C6FFF" },
  { id: 3, name: "Подушка", emoji: "🛡️", target: 500000, saved: 212000, color: "#4FFFB0" },
];

const CHART_DATA = {
  expenses: {
    week:    [3200,1800,4200,2900,5100,1200,3800],
    month:   [28000,31000,24000,35000],
    quarter: [89000,94000,78000],
    year:    [82000,89000,94000,78000,91000,88000,95000,84000,90000,86000,93000,89200],
  },
  income: {
    week:    [0,125400,0,0,0,0,0],
    month:   [125400,118000,131000,122000],
    quarter: [378000,352000,394000],
    year:    [112000,118000,122000,131000,128000,135000,119000,124000,138000,125000,132000,125400],
  },
  savings: {
    week:    [0,36200,0,0,0,0,0],
    month:   [36200,25000,43000,29000],
    quarter: [116000,74000,132000],
    year:    [30000,29000,37000,53000,37000,47000,24000,40000,48000,39000,39000,36200],
  },
};

const PERIOD_LABELS = {
  week:    ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"],
  month:   ["Нед 1","Нед 2","Нед 3","Нед 4"],
  quarter: ["Дек","Янв","Фев"],
  year:    ["Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек","Янв","Фев"],
};

const fmt = (n, hide) =>
  hide ? "••••" : new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(n) + " ₽";

function useCounter(target, duration, trigger) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!trigger) return;
    let raf;
    const start = Date.now();
    const tick = () => {
      const p = Math.min((Date.now() - start) / duration, 1);
      setV(Math.round(target * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, trigger]);
  return v;
}

function Sparkline({ data, color, height }) {
  const max = Math.max(...data), min = Math.min(...data), range = max - min || 1;
  const w = 100, h = height;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 8) - 4;
    return x + "," + y;
  });
  const path = "M " + pts.join(" L ");
  const area = "M " + pts[0] + " L " + pts.join(" L ") + " L " + w + "," + h + " L 0," + h + " Z";
  const gid = "sg" + color.replace("#","");
  return (
    <svg viewBox={"0 0 100 " + h} style={{ width: "100%", height }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <path d={area} fill={"url(#" + gid + ")"}/>
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

function BarChart({ data, labels, color }) {
  const max = Math.max(...data);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 72 }}>
      {data.map((v, i) => (
        <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
          <div style={{ width: "100%", height: 56, display: "flex", alignItems: "flex-end" }}>
            <div style={{
              width: "100%",
              height: Math.max((v / max) * 100, 4) + "%",
              background: "linear-gradient(180deg, " + color + ", " + color + "88)",
              borderRadius: "4px 4px 0 0",
              minHeight: 4,
              boxShadow: "0 0 6px " + color + "40",
            }}/>
          </div>
          <span style={{ fontSize: 7, color: "rgba(255,255,255,0.25)", fontFamily: "monospace" }}>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function AccountCard({ acc, hidden, onEdit, onDelete }) {
  const [showMenu, setShowMenu] = useState(false);
  const bal = useCounter(acc.balance, 700, true);
  return (
    <div style={{ minWidth: 148, background: "linear-gradient(135deg,#161E35,#11172A)", border: "1px solid " + acc.color + "22", borderRadius: 20, padding: "16px 15px", flexShrink: 0, position: "relative", cursor: "pointer", userSelect: "none" }}
      onClick={() => setShowMenu(!showMenu)}>
      <div style={{ width: 34, height: 34, borderRadius: 11, background: acc.color + "18", border: "1px solid " + acc.color + "30", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 12, color: acc.color }}>
        <Icon name={acc.icon} size={17} color={acc.color}/>
      </div>
      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", marginBottom: 3, fontWeight: 500 }}>{acc.name}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: "#fff", fontFamily: "'DM Mono',monospace", letterSpacing: "-0.3px" }}>
        {hidden ? "••••••" : bal.toLocaleString("ru-RU") + " ₽"}
      </div>
      {showMenu && (
        <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, background: "#1A2140", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 5, zIndex: 100, minWidth: 148, boxShadow: "0 8px 32px rgba(0,0,0,0.5)" }}
          onClick={e => e.stopPropagation()}>
          <button onClick={() => { onEdit(acc); setShowMenu(false); }}
            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", background: "none", border: "none", color: "rgba(255,255,255,0.8)", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 9, fontFamily: "'DM Sans',sans-serif" }}>
            <Icon name="edit" size={13} color="#4FC3FF"/> Редактировать
          </button>
          <button onClick={() => { onDelete(acc.id); setShowMenu(false); }}
            style={{ display: "flex", alignItems: "center", gap: 9, width: "100%", padding: "9px 11px", background: "none", border: "none", color: "#FF6B6B", fontSize: 12, fontWeight: 600, cursor: "pointer", borderRadius: 9, fontFamily: "'DM Sans',sans-serif" }}>
            <Icon name="trash" size={13} color="#FF6B6B"/> Удалить
          </button>
        </div>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.72)", backdropFilter: "blur(10px)", zIndex: 200, display: "flex", alignItems: "flex-end" }} onClick={onClose}>
      <div style={{ width: "100%", background: "#131929", borderRadius: "24px 24px 0 0", padding: "24px 20px 44px", border: "1px solid rgba(255,255,255,0.08)" }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
          <span style={{ fontSize: 18, fontWeight: 800 }}>{title}</span>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.07)", border: "none", borderRadius: 10, padding: "7px 9px", cursor: "pointer" }}>
            <Icon name="x" size={16} color="rgba(255,255,255,0.6)"/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function HomeDashboard() {
  const [hidden, setHidden] = useState(false);
  const [accounts, setAccounts] = useState(INITIAL_ACCOUNTS);
  const [goals] = useState(INITIAL_GOALS);
  const [flowTab, setFlowTab] = useState("expenses");
  const [period, setPeriod] = useState("month");
  const [mounted, setMounted] = useState(false);
  const [editAcc, setEditAcc] = useState(null);
  const [showAccModal, setShowAccModal] = useState(false);
  const [newAcc, setNewAcc] = useState({ name: "", balance: "", icon: "card", color: "#4FC3FF" });

  useEffect(() => { setTimeout(() => setMounted(true), 80); }, []);

  const totalBalance = accounts.reduce((s, a) => s + a.balance, 0);
  const totalCounter = useCounter(totalBalance, 900, mounted);

  const chartData = CHART_DATA[flowTab][period];
  const chartLabels = PERIOD_LABELS[period];
  const chartTotal = chartData.reduce((s, v) => s + v, 0);
  const flowConfig = {
    expenses: { label: "Расходы",    color: "#FF6B6B", sign: "−" },
    income:   { label: "Доходы",     color: "#4FFFB0", sign: "+" },
    savings:  { label: "Накопления", color: "#7C6FFF", sign: "+" },
  };
  const chartColor = flowConfig[flowTab].color;

  const deleteAccount = id => setAccounts(prev => prev.filter(a => a.id !== id));
  const openEdit = acc => { setEditAcc(acc); setNewAcc({ name: acc.name, balance: String(acc.balance), icon: acc.icon, color: acc.color }); setShowAccModal(true); };
  const openAdd = () => { setEditAcc(null); setNewAcc({ name: "", balance: "", icon: "card", color: "#4FC3FF" }); setShowAccModal(true); };
  const saveAccount = () => {
    if (!newAcc.name) return;
    if (editAcc) {
      setAccounts(prev => prev.map(a => a.id === editAcc.id ? { ...a, ...newAcc, balance: parseFloat(newAcc.balance) || 0 } : a));
    } else {
      setAccounts(prev => [...prev, { id: Date.now(), ...newAcc, balance: parseFloat(newAcc.balance) || 0 }]);
    }
    setShowAccModal(false); setEditAcc(null);
  };

  const COLORS = ["#4FC3FF","#4FFFB0","#7C6FFF","#FFB84F","#FF6B6B","#F472B6","#A3E635"];
  const ICONS  = ["card","cash","home","car","savings","flag"];

  return (
    <div style={{ width: "100%", minHeight: "100vh", background: "#090C18", fontFamily: "'DM Sans',sans-serif", color: "#fff", overflowX: "hidden" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700;9..40,800;9..40,900&family=DM+Mono&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{display:none;}
        body{background:#090C18;}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px);}to{opacity:1;transform:none;}}
        .s0{animation:fadeUp .45s ease both;animation-delay:0ms;}
        .s1{animation:fadeUp .45s ease both;animation-delay:80ms;}
        .s2{animation:fadeUp .45s ease both;animation-delay:160ms;}
        .s3{animation:fadeUp .45s ease both;animation-delay:240ms;}
        .s4{animation:fadeUp .45s ease both;animation-delay:320ms;}
        .ftab{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:13px;font-weight:700;padding:10px 0;flex:1;position:relative;transition:color .2s;}
        .ptab{background:none;border:none;cursor:pointer;font-family:'DM Sans',sans-serif;font-size:11px;font-weight:600;padding:5px 10px;border-radius:18px;transition:all .2s;white-space:nowrap;color:rgba(255,255,255,.3);}
        .ptab.on{background:rgba(255,255,255,.09);color:rgba(255,255,255,.9);}
        input[type=text],input[type=number]{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:12px;padding:12px 14px;color:#fff;font-family:'DM Sans',sans-serif;font-size:14px;width:100%;outline:none;}
        input:focus{border-color:rgba(255,255,255,.25);}
        .bnav{display:flex;justify-content:space-around;padding:12px 0 28px;background:rgba(9,12,24,.97);backdrop-filter:blur(20px);border-top:1px solid rgba(255,255,255,.05);}
        .bnav-item{display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;padding:4px 12px;}
        .bnav-lbl{font-size:10px;color:rgba(255,255,255,.28);}
        .bnav-lbl.on{color:#4FFFB0;}
        .icolor-btn{width:28px;height:28px;border-radius:50%;cursor:pointer;border:2.5px solid transparent;transition:transform .15s;}
        .icon-btn{width:40px;height:40px;border-radius:11px;cursor:pointer;display:flex;align-items:center;justify-content:center;border:1.5px solid transparent;transition:all .15s;}
      `}</style>

      {/* HEADER */}
      <div className="s0" style={{ padding: "52px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,.38)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: 2 }}>Добро пожаловать 👋</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>Февраль 2026</div>
        </div>
        <button style={{ background: "rgba(255,255,255,.06)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 14, padding: "9px 10px", cursor: "pointer", position: "relative" }}>
          <Icon name="bell" size={18} color="rgba(255,255,255,.55)"/>
          <div style={{ position: "absolute", top: 8, right: 8, width: 7, height: 7, borderRadius: "50%", background: "#FF6B6B", border: "1.5px solid #090C18" }}/>
        </button>
      </div>

      {/* BALANCE HERO */}
      <div className="s1" style={{ padding: "18px 20px 0" }}>
        <div style={{ background: "linear-gradient(135deg,#131D38 0%,#0F1628 60%,#141030 100%)", border: "1px solid rgba(255,255,255,.07)", borderRadius: 26, padding: "22px 20px 20px", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", top: -40, right: -40, width: 160, height: 160, borderRadius: "50%", background: "radial-gradient(circle,rgba(79,195,255,.12),transparent 70%)", pointerEvents: "none" }}/>
          <div style={{ position: "absolute", bottom: -30, left: 20, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle,rgba(124,111,255,.1),transparent 70%)", pointerEvents: "none" }}/>

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,.4)", fontWeight: 500 }}>{hidden ? "Баланс скрыт" : "Активный баланс"}</div>
            <button onClick={() => setHidden(!hidden)}
              style={{ display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,.07)", border: "none", borderRadius: 10, padding: "6px 10px", cursor: "pointer", color: "rgba(255,255,255,.5)", fontSize: 11, fontWeight: 600, fontFamily: "'DM Sans',sans-serif" }}>
              <Icon name={hidden ? "eyeOff" : "eye"} size={13} color="rgba(255,255,255,.5)"/>
              {hidden ? "Показать" : "Скрыть"}
            </button>
          </div>

          <div style={{ fontSize: hidden ? 34 : 40, fontWeight: 900, letterSpacing: "-1.5px", lineHeight: 1.1, marginBottom: 5, fontFamily: "'DM Mono',monospace" }}>
            {hidden ? "•••••• ₽" : totalCounter.toLocaleString("ru-RU") + " ₽"}
          </div>
          <div style={{ fontSize: 12, color: "rgba(255,255,255,.28)", marginBottom: 18 }}>Всего на {accounts.length} счетах</div>

          <div style={{ display: "flex", gap: 7 }}>
            {[
              { label: "Доходы",  val: "125 400 ₽", color: "#4FFFB0", arrow: "↑" },
              { label: "Расходы", val: "89 200 ₽",  color: "#FF6B6B", arrow: "↓" },
              { label: "Баланс",  val: "+36 200 ₽", color: "#7C6FFF", arrow: "→" },
            ].map(item => (
              <div key={item.label} style={{ flex: 1, background: "rgba(255,255,255,.04)", borderRadius: 14, padding: "10px 7px", textAlign: "center" }}>
                <div style={{ fontSize: 9, color: "rgba(255,255,255,.3)", marginBottom: 4 }}>{item.label}</div>
                <div style={{ fontSize: 11, fontWeight: 800, color: item.color, fontFamily: "'DM Mono',monospace" }}>
                  {hidden ? "•••" : item.arrow + " " + item.val}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ACCOUNTS */}
      <div className="s2" style={{ padding: "20px 0 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0 20px", marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Счета</span>
          <button onClick={openAdd}
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(79,195,255,.1)", border: "1px solid rgba(79,195,255,.25)", borderRadius: 12, padding: "7px 13px", color: "#4FC3FF", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            <Icon name="plus" size={13} color="#4FC3FF"/> Добавить
          </button>
        </div>
        <div style={{ display: "flex", gap: 12, overflowX: "auto", padding: "2px 20px 6px" }}>
          {accounts.map(acc => (
            <AccountCard key={acc.id} acc={acc} hidden={hidden} onEdit={openEdit} onDelete={deleteAccount}/>
          ))}
        </div>
      </div>

      {/* FLOW BLOCK */}
      <div className="s3" style={{ padding: "20px 20px 0" }}>
        <div style={{ background: "#131929", border: "1px solid rgba(255,255,255,.06)", borderRadius: 24, padding: "18px 16px 18px" }}>
          {/* Flow tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,.06)", marginBottom: 16 }}>
            {Object.entries(flowConfig).map(([key, cfg]) => (
              <button key={key} className="ftab" onClick={() => setFlowTab(key)}
                style={{ color: flowTab === key ? cfg.color : "rgba(255,255,255,.28)", paddingBottom: 12 }}>
                {cfg.label}
                {flowTab === key && <div style={{ position: "absolute", bottom: 0, left: "15%", right: "15%", height: 2.5, background: cfg.color, borderRadius: 2, boxShadow: "0 0 8px " + cfg.color }}/>}
              </button>
            ))}
          </div>

          {/* Total */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 2 }}>
            <div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.3)", textTransform: "uppercase", letterSpacing: ".5px", marginBottom: 4 }}>
                За {{ week: "неделю", month: "месяц", quarter: "квартал", year: "год" }[period]}
              </div>
              <div style={{ fontSize: 24, fontWeight: 900, letterSpacing: "-.5px", color: chartColor, fontFamily: "'DM Mono',monospace" }}>
                {hidden ? "•••••• ₽" : flowConfig[flowTab].sign + chartTotal.toLocaleString("ru-RU") + " ₽"}
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 11, color: "#4FFFB0", fontWeight: 700 }}>↑ 12%</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,.28)" }}>vs прошлый</div>
            </div>
          </div>

          {/* Sparkline */}
          <div style={{ margin: "10px 0 8px" }}>
            <Sparkline data={chartData} color={chartColor} height={44}/>
          </div>

          {/* Bar chart */}
          <BarChart key={flowTab + period} data={chartData} labels={chartLabels} color={chartColor}/>

          {/* Period tabs */}
          <div style={{ display: "flex", gap: 4, marginTop: 14, background: "rgba(255,255,255,.04)", borderRadius: 22, padding: 4 }}>
            {["week","month","quarter","year"].map(p => (
              <button key={p} className={"ptab" + (period === p ? " on" : "")} onClick={() => setPeriod(p)} style={{ flex: 1 }}>
                {{ week: "Неделя", month: "Месяц", quarter: "Кварт.", year: "Год" }[p]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* GOALS */}
      <div className="s4" style={{ padding: "20px 20px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <span style={{ fontSize: 16, fontWeight: 800 }}>Цели</span>
          <button style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(79,255,176,.1)", border: "1px solid rgba(79,255,176,.2)", borderRadius: 12, padding: "7px 13px", color: "#4FFFB0", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans',sans-serif" }}>
            <Icon name="plus" size={13} color="#4FFFB0"/> Добавить
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {goals.map((goal, i) => {
            const ratio = goal.saved / goal.target;
            return (
              <div key={goal.id} style={{ background: "linear-gradient(135deg,#131929,#111727)", border: "1px solid " + goal.color + "18", borderRadius: 20, padding: "16px 18px", animation: "fadeUp .5s ease both", animationDelay: (320 + i * 60) + "ms" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ fontSize: 24 }}>{goal.emoji}</div>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{goal.name}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,.33)", marginTop: 1 }}>Цель: {fmt(goal.target, hidden)}</div>
                    </div>
                  </div>
                  <div style={{ padding: "5px 11px", borderRadius: 20, background: goal.color + "15", border: "1px solid " + goal.color + "30", fontSize: 13, fontWeight: 800, color: goal.color, fontFamily: "'DM Mono',monospace" }}>
                    {Math.round(ratio * 100)}%
                  </div>
                </div>
                <div style={{ height: 5, background: "rgba(255,255,255,.07)", borderRadius: 3, overflow: "hidden", marginBottom: 10 }}>
                  <div style={{ height: "100%", width: (ratio * 100) + "%", background: "linear-gradient(90deg," + goal.color + "bb," + goal.color + ")", borderRadius: 3, boxShadow: "0 0 10px " + goal.color + "50" }}/>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: goal.color, fontFamily: "'DM Mono',monospace" }}>{fmt(goal.saved, hidden)}</span>
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,.3)" }}>осталось {fmt(goal.target - goal.saved, hidden)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: 120 }}/>

      {/* FAB */}
      <button style={{ position: "fixed", bottom: 90, right: 20, width: 56, height: 56, borderRadius: "50%", background: "linear-gradient(135deg,#4FC3FF,#7C6FFF)", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 28px rgba(79,195,255,.4),0 4px 12px rgba(0,0,0,.4)" }}>
        <Icon name="plus" size={24} color="#fff"/>
      </button>

      {/* BOTTOM NAV */}
      <div style={{ position: "fixed", bottom: 0, left: 0, right: 0 }} className="bnav">
        {[
          { icon: "home",     label: "Главная",    active: true  },
          { icon: "trending", label: "Транзакции", active: false },
          { icon: "card",     label: "Счета",      active: false },
          { icon: "savings",  label: "Аналитика",  active: false },
          { icon: "flag",     label: "Настройки",  active: false },
        ].map((item, i) => (
          <div key={i} className="bnav-item">
            <Icon name={item.icon} size={21} color={item.active ? "#4FFFB0" : "rgba(255,255,255,.28)"}/>
            <span className={"bnav-lbl" + (item.active ? " on" : "")}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* MODAL: ADD / EDIT ACCOUNT */}
      {showAccModal && (
        <Modal title={editAcc ? "Редактировать счёт" : "Новый счёт"} onClose={() => { setShowAccModal(false); setEditAcc(null); }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".5px" }}>Название счёта</div>
              <input type="text" placeholder="Например: Сбербанк" value={newAcc.name} onChange={e => setNewAcc(p => ({ ...p, name: e.target.value }))}/>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 7, textTransform: "uppercase", letterSpacing: ".5px" }}>Баланс (₽)</div>
              <input type="number" placeholder="0" value={newAcc.balance} onChange={e => setNewAcc(p => ({ ...p, balance: e.target.value }))}/>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 9, textTransform: "uppercase", letterSpacing: ".5px" }}>Иконка</div>
              <div style={{ display: "flex", gap: 8 }}>
                {ICONS.map(ic => (
                  <button key={ic} className="icon-btn" onClick={() => setNewAcc(p => ({ ...p, icon: ic }))}
                    style={{ background: newAcc.icon === ic ? newAcc.color + "22" : "rgba(255,255,255,.05)", borderColor: newAcc.icon === ic ? newAcc.color : "transparent" }}>
                    <Icon name={ic} size={17} color={newAcc.icon === ic ? newAcc.color : "rgba(255,255,255,.35)"}/>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,.4)", marginBottom: 9, textTransform: "uppercase", letterSpacing: ".5px" }}>Цвет</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                {COLORS.map(c => (
                  <button key={c} className="icolor-btn" onClick={() => setNewAcc(p => ({ ...p, color: c }))}
                    style={{ background: c, borderColor: newAcc.color === c ? "#fff" : "transparent", transform: newAcc.color === c ? "scale(1.25)" : "scale(1)" }}/>
                ))}
              </div>
            </div>
            <button onClick={saveAccount}
              style={{ width: "100%", padding: "15px", background: "linear-gradient(135deg," + newAcc.color + "," + newAcc.color + "bb)", border: "none", borderRadius: 16, color: "#000", fontSize: 15, fontWeight: 800, cursor: "pointer", fontFamily: "'DM Sans',sans-serif", marginTop: 4, boxShadow: "0 8px 24px " + newAcc.color + "40" }}>
              {editAcc ? "Сохранить изменения" : "Создать счёт"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
