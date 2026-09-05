import React, { useState, useEffect, useMemo } from "react";
import {
  AreaChart,
  Area,
  ResponsiveContainer,
  YAxis,
  Tooltip as RTooltip,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Gauge,
  Landmark,
  DollarSign,
  Globe2,
  Boxes,
  Wifi,
  WifiOff,
  RefreshCw,
  RotateCcw,
  Scale,
} from "lucide-react";
import { useLivePrice } from "./useLivePrice.js";

const STORAGE_KEY = "aurum-desk-settings";

function ema(values, period) {
  const k = 2 / (period + 1);
  const out = [values[0]];
  for (let i = 1; i < values.length; i++) out.push(values[i] * k + out[i - 1] * (1 - k));
  return out;
}

function computeRSI(prices, period = 14) {
  if (prices.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change >= 0) gains += change;
    else losses -= change;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  return Math.round(100 - 100 / (1 + avgGain / avgLoss));
}

function computeMACD(prices) {
  if (prices.length < 26) return { line: 0, signal: 0, hist: 0 };
  const ema12 = ema(prices, 12);
  const ema26 = ema(prices, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  const signalLine = ema(macdLine, 9);
  const last = macdLine.length - 1;
  return { line: macdLine[last], signal: signalLine[last], hist: macdLine[last] - signalLine[last] };
}

function computeBollinger(prices, period = 20, mult = 2) {
  const n = Math.min(period, prices.length);
  const slice = prices.slice(-n);
  const mean = slice.reduce((a, b) => a + b, 0) / n;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / n;
  const std = Math.sqrt(variance);
  return { mid: mean, upper: mean + mult * std, lower: mean - mult * std, widthPct: ((2 * mult * std) / mean) * 100 };
}

function computeVolatility(prices, period = 14) {
  const n = Math.min(period, prices.length - 1);
  let sum = 0;
  for (let i = prices.length - n; i < prices.length; i++) sum += Math.abs((prices[i] - prices[i - 1]) / prices[i - 1]);
  return (sum / n) * 100;
}

function findSwings(prices, window = 3) {
  const highs = [];
  const lows = [];
  for (let i = window; i < prices.length - window; i++) {
    const slice = prices.slice(i - window, i + window + 1);
    const center = prices[i];
    if (center === Math.max(...slice)) highs.push(center);
    if (center === Math.min(...slice)) lows.push(center);
  }
  return { highs, lows };
}

function supportResistance(prices, currentPrice) {
  const { highs, lows } = findSwings(prices);
  const resistanceCandidates = highs.filter((h) => h > currentPrice);
  const supportCandidates = lows.filter((l) => l < currentPrice);
  const resistance = resistanceCandidates.length ? Math.min(...resistanceCandidates) : Math.max(...prices);
  const support = supportCandidates.length ? Math.max(...supportCandidates) : Math.min(...prices);
  return { support, resistance };
}

const MACRO_FACTORS = [
  { key: "fed", label: "Fed policy stance", left: "Hawkish", right: "Dovish", icon: Landmark },
  { key: "yields", label: "Real yields direction", left: "Rising", right: "Falling", icon: TrendingUp },
  { key: "dollar", label: "Dollar (DXY) trend", left: "Strengthening", right: "Weakening", icon: DollarSign },
  { key: "geo", label: "Geopolitical risk", left: "Low", right: "High", icon: Globe2 },
  { key: "cb", label: "Central bank / ETF demand", left: "Net selling", right: "Net buying", icon: Boxes },
];
const MACRO_DEFAULTS = { fed: 0, yields: 0, dollar: 0, geo: 0, cb: 0 };

function biasLabel(score) {
  if (score > 0.5) return { text: "Strongly bullish", tone: "pos" };
  if (score > 0.15) return { text: "Bullish", tone: "pos" };
  if (score < -0.5) return { text: "Strongly bearish", tone: "neg" };
  if (score < -0.15) return { text: "Bearish", tone: "neg" };
  return { text: "Neutral", tone: "neu" };
}

const TONE = { pos: "#6FA287", neg: "#B56354", neu: "#A79C86" };

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

export default function GoldIntelligenceDashboard() {
  const live = useLivePrice();
  const [macro, setMacro] = useState(() => ({ ...MACRO_DEFAULTS, ...(loadSettings().macro || {}) }));
  const [weight, setWeight] = useState(() => (typeof loadSettings().weight === "number" ? loadSettings().weight : 50));

  useEffect(() => {
    const id = setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ macro, weight }));
    }, 400);
    return () => clearTimeout(id);
  }, [macro, weight]);

  const currentPrice = live.price ?? 0;
  const prevClose = live.prevClose ?? currentPrice;
  const history = live.history.length ? live.history : [{ i: 0, price: currentPrice || 0 }];
  const prices = useMemo(() => history.map((h) => h.price).filter((p) => p > 0), [history]);
  const hasData = prices.length > 1;

  const rsi = useMemo(() => (hasData ? computeRSI(prices) : 50), [prices, hasData]);
  const macd = useMemo(() => (hasData ? computeMACD(prices) : { line: 0, signal: 0, hist: 0 }), [prices, hasData]);
  const bollinger = useMemo(
    () => (hasData ? computeBollinger(prices) : { mid: currentPrice, upper: currentPrice, lower: currentPrice, widthPct: 0 }),
    [prices, hasData, currentPrice]
  );
  const volatility = useMemo(() => (hasData ? computeVolatility(prices) : 0), [prices, hasData]);
  const { support, resistance } = useMemo(
    () => (hasData ? supportResistance(prices, currentPrice) : { support: currentPrice, resistance: currentPrice }),
    [prices, hasData, currentPrice]
  );
  const dayHigh = useMemo(() => (prices.length ? Math.max(...prices) : currentPrice), [prices, currentPrice]);
  const dayLow = useMemo(() => (prices.length ? Math.min(...prices) : currentPrice), [prices, currentPrice]);

  const smaShort = useMemo(() => {
    const n = Math.min(10, prices.length) || 1;
    return prices.slice(-n).reduce((a, b) => a + b, 0) / n;
  }, [prices]);
  const smaLong = useMemo(() => {
    const n = Math.min(40, prices.length) || 1;
    return prices.slice(-n).reduce((a, b) => a + b, 0) / n;
  }, [prices]);
  const trend = smaShort > smaLong ? "up" : smaShort < smaLong ? "down" : "flat";

  const technicalScore = useMemo(() => {
    if (!hasData || !currentPrice) return 0;
    const rsiScore = (rsi - 50) / 50;
    const macdScore = Math.max(-1, Math.min(1, macd.hist / (currentPrice * 0.001)));
    const trendScore = trend === "up" ? 0.6 : trend === "down" ? -0.6 : 0;
    const bandScore = Math.max(-1, Math.min(1, (currentPrice - bollinger.mid) / ((bollinger.upper - bollinger.mid) || 1)));
    return rsiScore * 0.3 + macdScore * 0.3 + trendScore * 0.25 + bandScore * 0.15;
  }, [rsi, macd, trend, currentPrice, bollinger, hasData]);

  const macroScore = useMemo(() => {
    const vals = Object.values(macro);
    return vals.reduce((a, b) => a + b, 0) / vals.length / 100;
  }, [macro]);

  const techWeight = weight / 100;
  const macroWeight = 1 - techWeight;
  const compositeScore = technicalScore * techWeight + macroScore * macroWeight;
  const bias = biasLabel(compositeScore);
  const technicalBias = biasLabel(technicalScore);
  const macroBias = biasLabel(macroScore);

  const change = currentPrice - prevClose;
  const changePct = prevClose ? (change / prevClose) * 100 : 0;
  const isUp = change >= 0;
  const chartData = history.map((h) => ({ i: h.i, price: h.price }));
  const resetMacro = () => setMacro(MACRO_DEFAULTS);

  return (
    <div style={{ fontFamily: "'Inter', sans-serif", background: "#100E0A", color: "#F0E9D8", minHeight: "100vh", padding: "28px 16px" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500;600&display=swap');
        .mono { font-family: 'JetBrains Mono', monospace; }
        .voice { font-family: 'Fraunces', serif; }
        .aurum-wrap { max-width: 980px; margin: 0 auto; }
        .aurum-hero { display: grid; grid-template-columns: minmax(220px, 1fr) 2fr; gap: 24px; }
        .aurum-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        @media (max-width: 680px) {
          .aurum-hero { grid-template-columns: 1fr; }
          .aurum-cols { grid-template-columns: 1fr; }
        }
        input[type=range] { -webkit-appearance: none; width: 100%; height: 3px; background: #332B1F; border-radius: 2px; outline: none; }
        input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 15px; height: 15px; border-radius: 50%; background: #C6A15B; cursor: pointer; border: 2px solid #100E0A; }
        input[type=range]::-moz-range-thumb { width: 15px; height: 15px; border-radius: 50%; background: #C6A15B; cursor: pointer; border: 2px solid #100E0A; }
        .aurum-btn { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: 1px solid #332B1F; color: #A79C86; font-size: 12px; padding: 6px 10px; border-radius: 6px; cursor: pointer; }
        .aurum-btn:hover { border-color: #6B6353; color: #F0E9D8; }
      `}</style>

      <div className="aurum-wrap">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 16, marginBottom: 28, paddingBottom: 20, borderBottom: "1px solid #2A241B" }}>
          <div>
            <h1 className="voice" style={{ fontSize: 26, fontWeight: 500, margin: 0, letterSpacing: "-0.01em" }}>Aurum Desk</h1>
            <p style={{ fontSize: 13, color: "#A79C86", margin: "4px 0 0" }}>Gold market intelligence — technical read meets macro judgment</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: live.isLive ? "#6FA287" : "#A79C86", background: "#1B1712", border: "1px solid #2A241B", borderRadius: 6, padding: "6px 12px" }}>
              {live.isLive ? <Wifi size={13} /> : <WifiOff size={13} />}
              <span>{live.source === "connecting" ? "Connecting…" : live.source === "disconnected" ? "Backend unreachable" : `Live via ${live.source}`}</span>
            </div>
            <button className="aurum-btn" onClick={live.reconnect}>
              <RefreshCw size={12} />
              Reconnect
            </button>
          </div>
        </div>

        <div className="aurum-hero" style={{ marginBottom: 24, background: "#1B1712", border: "1px solid #2A241B", borderRadius: 10, padding: 24 }}>
          <div>
            <div style={{ fontSize: 13, color: "#A79C86", marginBottom: 6 }}>XAU / USD, per troy ounce</div>
            <div className="mono" style={{ fontSize: 38, fontWeight: 600, lineHeight: 1.1, color: "#E4C275" }}>
              {currentPrice ? `$${currentPrice.toFixed(2)}` : "—"}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8, fontSize: 14, color: isUp ? "#6FA287" : "#B56354" }}>
              {isUp ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="mono">{isUp ? "+" : ""}{change.toFixed(2)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)</span>
            </div>
            <div style={{ display: "flex", gap: 16, marginTop: 14, fontSize: 12, color: "#6B6353" }}>
              <span>Range <span className="mono">${dayLow.toFixed(0)}–${dayHigh.toFixed(0)}</span></span>
            </div>
            <div style={{ fontSize: 11, color: "#6B6353", marginTop: 10 }}>
              {live.updatedAt ? `Updated ${new Date(live.updatedAt).toLocaleTimeString()}` : "Waiting for first update…"}
            </div>
          </div>
          <div style={{ minHeight: 140 }}>
            <ResponsiveContainer width="100%" height={140}>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="goldFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#C6A15B" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#C6A15B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <YAxis domain={["auto", "auto"]} hide />
                <ReferenceLine y={resistance} stroke="#B56354" strokeDasharray="3 3" strokeOpacity={0.6} />
                <ReferenceLine y={support} stroke="#6FA287" strokeDasharray="3 3" strokeOpacity={0.6} />
                <RTooltip contentStyle={{ background: "#221C15", border: "1px solid #332B1F", borderRadius: 6, fontSize: 12 }} labelFormatter={() => ""} formatter={(v) => [`$${v.toFixed(2)}`, "Price"]} />
                <Area type="monotone" dataKey="price" stroke="#C6A15B" strokeWidth={1.5} fill="url(#goldFill)" />
              </AreaChart>
            </ResponsiveContainer>
            <div style={{ display: "flex", gap: 14, fontSize: 11, color: "#6B6353", marginTop: 4 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 2, background: "#B56354", display: "inline-block" }} /> Resistance</span>
              <span style={{ display: "flex", alignItems: "center", gap: 4 }}><span style={{ width: 10, height: 2, background: "#6FA287", display: "inline-block" }} /> Support</span>
            </div>
          </div>
        </div>

        <div className="aurum-cols" style={{ marginBottom: 20 }}>
          <div style={{ background: "#1B1712", border: "1px solid #2A241B", borderRadius: 10, padding: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
              <Gauge size={16} color="#C6A15B" />
              <h2 className="voice" style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Technical read</h2>
            </div>
            <Row label="RSI (14)" value={rsi} sub={rsi > 70 ? "Overbought" : rsi < 30 ? "Oversold" : "Neutral zone"} />
            <Row label="Trend (10 vs 40 period)" value={trend === "up" ? "Rising" : trend === "down" ? "Falling" : "Flat"} sub={`SMA10 $${smaShort.toFixed(0)} vs SMA40 $${smaLong.toFixed(0)}`} />
            <Row label="MACD histogram" value={macd.hist > 0 ? "Bullish cross" : "Bearish cross"} sub={`${macd.hist > 0 ? "+" : ""}${macd.hist.toFixed(2)}`} />
            <Row label="Bollinger bands (20, 2σ)" value={currentPrice > bollinger.upper ? "Above upper band" : currentPrice < bollinger.lower ? "Below lower band" : "Inside bands"} sub={`$${bollinger.lower.toFixed(0)} – $${bollinger.upper.toFixed(0)}, width ${bollinger.widthPct.toFixed(1)}%`} />
            <Row label="Volatility (14-period avg move)" value={`${volatility.toFixed(2)}%`} sub="Per-period average absolute change" />
            <Row label="Support" value={`$${support.toFixed(0)}`} sub="Nearest swing low" />
            <Row label="Resistance" value={`$${resistance.toFixed(0)}`} sub="Nearest swing high" last />
            <BiasStrip label="Technical bias" bias={technicalBias} />
          </div>

          <div style={{ background: "#1B1712", border: "1px solid #2A241B", borderRadius: 10, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Globe2 size={16} color="#C6A15B" />
                <h2 className="voice" style={{ fontSize: 17, fontWeight: 500, margin: 0 }}>Macro sentiment</h2>
              </div>
              <button className="aurum-btn" onClick={resetMacro}><RotateCcw size={11} />Reset</button>
            </div>
            <p style={{ fontSize: 12, color: "#6B6353", margin: "0 0 16px" }}>Set each slider to your own read of current conditions. Saved in this browser for next time.</p>
            {MACRO_FACTORS.map((f) => (
              <div key={f.key} style={{ marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6, color: "#F0E9D8" }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><f.icon size={13} color="#A79C86" />{f.label}</span>
                </div>
                <input type="range" min={-100} max={100} step={5} value={macro[f.key]} onChange={(e) => setMacro((m) => ({ ...m, [f.key]: Number(e.target.value) }))} />
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B6353", marginTop: 3 }}>
                  <span>{f.left}</span><span>{f.right}</span>
                </div>
              </div>
            ))}
            <BiasStrip label="Macro bias" bias={macroBias} />
          </div>
        </div>

        <div style={{ background: "#1B1712", border: "1px solid #2A241B", borderRadius: 10, padding: "16px 22px", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Scale size={15} color="#C6A15B" />
            <span style={{ fontSize: 13, color: "#F0E9D8" }}>How to weigh the verdict</span>
          </div>
          <input type="range" min={0} max={100} step={5} value={weight} onChange={(e) => setWeight(Number(e.target.value))} />
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#6B6353", marginTop: 4 }}>
            <span>Macro-led ({100 - weight}%)</span>
            <span>Technical-led ({weight}%)</span>
          </div>
        </div>

        <div style={{ background: "#1B1712", border: `1px solid ${TONE[bias.tone]}55`, borderRadius: 10, padding: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 13, color: "#A79C86", marginBottom: 4 }}>Composite verdict</div>
              <div className="voice" style={{ fontSize: 25, fontWeight: 500, color: TONE[bias.tone] }}>{bias.text}</div>
            </div>
            <div style={{ display: "flex", gap: 24 }}>
              <MiniStat label={`Technical ×${techWeight.toFixed(2)}`} score={technicalScore} />
              <MiniStat label={`Macro ×${macroWeight.toFixed(2)}`} score={macroScore} />
            </div>
          </div>
          <div style={{ height: 8, borderRadius: 4, background: "#2A241B", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#6B6353" }} />
            <div style={{ position: "absolute", top: 0, bottom: 0, left: compositeScore >= 0 ? "50%" : `${50 + compositeScore * 50}%`, width: `${Math.abs(compositeScore) * 50}%`, background: TONE[bias.tone] }} />
          </div>
          <p style={{ fontSize: 12, color: "#6B6353", marginTop: 14, lineHeight: 1.6 }}>
            Blended using the weighting above between the technical read (price action, RSI, MACD, Bollinger position, trend) and your macro sentiment inputs. This is a framework for organizing your own analysis, not a trade signal.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", padding: "10px 0", borderBottom: last ? "none" : "1px solid #221C15", gap: 12 }}>
      <span style={{ fontSize: 13, color: "#A79C86" }}>{label}</span>
      <div style={{ textAlign: "right" }}>
        <div className="mono" style={{ fontSize: 14, fontWeight: 500 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: "#6B6353" }}>{sub}</div>}
      </div>
    </div>
  );
}

function BiasStrip({ label, bias }) {
  return (
    <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #221C15", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 12, color: "#A79C86" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, color: TONE[bias.tone] }}>{bias.text}</span>
    </div>
  );
}

function MiniStat({ label, score }) {
  const tone = score > 0.15 ? "#6FA287" : score < -0.15 ? "#B56354" : "#A79C86";
  return (
    <div style={{ textAlign: "right" }}>
      <div style={{ fontSize: 11, color: "#6B6353" }}>{label}</div>
      <div className="mono" style={{ fontSize: 15, fontWeight: 600, color: tone }}>{score >= 0 ? "+" : ""}{(score * 100).toFixed(0)}</div>
    </div>
  );
      }
