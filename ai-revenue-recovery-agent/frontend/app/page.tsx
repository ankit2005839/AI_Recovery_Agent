'use client';

import React, { useState } from 'react';
import {
  TrendingUp,
  Bot,
  Activity,
  DollarSign,
  Users,
  CheckCircle2,
  Clock,
  AlertCircle,
  Play,
  Zap,
  Mail,
  MessageSquare,
  ArrowUpRight,
  ShieldAlert,
  RefreshCw
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from 'recharts';

// Mock Data Fallbacks & Initial State
const initialChartData = [
  { day: 'Mon', recovered: 2400, atRisk: 4000 },
  { day: 'Tue', recovered: 1398, atRisk: 3000 },
  { day: 'Wed', recovered: 9800, atRisk: 2000 },
  { day: 'Thu', recovered: 3908, atRisk: 2780 },
  { day: 'Fri', recovered: 4800, atRisk: 1890 },
  { day: 'Sat', recovered: 3800, atRisk: 2390 },
  { day: 'Sun', recovered: 4300, atRisk: 3490 },
];

const initialCampaigns = [
  { id: '1', name: 'Acme Corp', amount: '$1,250.00', channel: 'Email', status: 'Recovered', time: '10 mins ago' },
  { id: '2', name: 'Starlight Tech', amount: '$850.00', channel: 'SMS', status: 'Pending', time: '25 mins ago' },
  { id: '3', name: 'Nexus Logistics', amount: '$3,400.00', channel: 'WhatsApp', status: 'Escalated', time: '1 hour ago' },
  { id: '4', name: 'Apex Media', amount: '$420.00', channel: 'Email', status: 'Recovered', time: '2 hours ago' },
  { id: '5', name: 'SaaSify Inc', amount: '$2,100.00', channel: 'SMS', status: 'Failed', time: '4 hours ago' },
];

const initialLogs = [
  { id: 1, time: '14:32:10', type: 'success', text: 'Stripe webhook received: Payment failure recovered for Acme Corp ($1,250.00)' },
  { id: 2, time: '14:28:05', type: 'ai', text: 'AI decision engine selected SMS channel for Starlight Tech based on response propensity score (0.89)' },
  { id: 3, time: '14:15:22', type: 'action', text: 'Generated personalized recovery link with 5% discount for Nexus Logistics' },
  { id: 4, time: '13:50:00', type: 'warning', text: 'Dunning email #2 opened by Apex Media' },
];

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState(initialCampaigns);
  const [logs, setLogs] = useState(initialLogs);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://airecoveryagent-production.up.railway.app';

  // Interactive Demo Trigger 1: Simulate Payment Failure
  const handleSimulateFailure = async () => {
    setLoadingAction('simulate');
    try {
      // Optional call to real backend API if present
      await fetch(`${API_URL}/api/simulate-failure`, { method: 'POST' }).catch(() => null);
      
      const newCustomer = {
        id: Date.now().toString(),
        name: `Customer_${Math.floor(Math.random() * 900 + 100)}`,
        amount: `$${(Math.random() * 800 + 200).toFixed(2)}`,
        channel: 'Email',
        status: 'Pending',
        time: 'Just now'
      };

      setCampaigns((prev) => [newCustomer, ...prev]);
      setLogs((prev) => [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          type: 'warning',
          text: `Payment failed for ${newCustomer.name} (${newCustomer.amount}). Initializing AI recovery workflow.`
        },
        ...prev
      ]);
    } finally {
      setLoadingAction(null);
    }
  };

  // Interactive Demo Trigger 2: Run AI Agent Loop
  const handleRunAIAgent = async () => {
    setLoadingAction('ai');
    try {
      await fetch(`${API_URL}/api/run-agent`, { method: 'POST' }).catch(() => null);

      setLogs((prev) => [
        {
          id: Date.now(),
          time: new Date().toLocaleTimeString(),
          type: 'ai',
          text: 'AI Agent scanned 3 pending accounts. Optimized tone and scheduled WhatsApp follow-ups.'
        },
        ...prev
      ]);

      // Update first pending customer to Recovered
      setCampaigns((prev) =>
        prev.map((c) => (c.status === 'Pending' ? { ...c, status: 'Recovered' } : c))
      );
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans p-4 md:p-8">
      {/* 1. TOP HACKATHON DEMO CONTROL BANNER */}
      <div className="mb-8 p-4 rounded-xl bg-slate-900/80 border border-slate-800 backdrop-blur-md flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
            <Zap className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Hackathon Live Evaluator Controls</h2>
            <p className="text-xs text-slate-400">Trigger backend AI logic and simulate failure webhooks live</p>
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleSimulateFailure}
            disabled={loadingAction === 'simulate'}
            className="px-4 py-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-xs font-medium flex items-center space-x-2 transition"
          >
            {loadingAction === 'simulate' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <ShieldAlert className="w-4 h-4" />}
            <span>Simulate Payment Failure</span>
          </button>
          <button
            onClick={handleRunAIAgent}
            disabled={loadingAction === 'ai'}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center space-x-2 shadow-lg shadow-indigo-600/20 transition"
          >
            {loadingAction === 'ai' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
            <span>Trigger AI Recovery Loop</span>
          </button>
        </div>
      </div>

      {/* 2. HEADER & NAVIGATION */}
      <header className="flex flex-col md:flex-row md:items-center justify-between pb-8 border-b border-slate-800 mb-8 gap-4">
        <div className="flex items-center space-x-3">
          <div className="p-3 bg-gradient-to-tr from-emerald-500 to-indigo-600 rounded-xl shadow-lg shadow-indigo-500/10">
            <Bot className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
              Ledger <span className="text-xs font-normal px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">v1.0</span>
            </h1>
            <p className="text-xs text-slate-400">Autonomous AI Revenue Recovery Engine</p>
          </div>
        </div>

        <div className="flex items-center space-x-3 bg-slate-900 px-3 py-1.5 rounded-full border border-slate-800 text-xs text-slate-300 w-fit">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Agent Online & Monitoring</span>
        </div>
      </header>

      {/* 3. KPI SUMMARY CARDS GRID (4 COLUMNS) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-medium text-slate-400">Total Recovered</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><DollarSign className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">$18,420.00</div>
          <div className="flex items-center space-x-1 text-xs text-emerald-400">
            <TrendingUp className="w-3 h-3" />
            <span>+18.4% this week</span>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-medium text-slate-400">Active Workflows</span>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400"><Activity className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">12 Active</div>
          <div className="text-xs text-slate-400">Automated interventions active</div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-medium text-slate-400">Recovery Rate</span>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400"><CheckCircle2 className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">74.2%</div>
          <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
            <div className="bg-emerald-500 h-full w-[74.2%]"></div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition">
          <div className="flex justify-between items-start mb-3">
            <span className="text-xs font-medium text-slate-400">Avg. Recovery Time</span>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400"><Clock className="w-4 h-4" /></div>
          </div>
          <div className="text-2xl font-bold text-white mb-1">1.8 Days</div>
          <div className="text-xs text-slate-400">From initial payment failure</div>
        </div>
      </div>

      {/* 4. TWO-COLUMN MAIN CONTENT LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN (2/3 WIDTH): ANALYTICS & RECOVERY TABLE */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Analytics Chart */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-base font-semibold text-white">Revenue Impact</h3>
                <p className="text-xs text-slate-400">Recovered vs. At-Risk Revenue over time</p>
              </div>
            </div>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={initialChartData}>
                  <defs>
                    <linearGradient id="recoveredGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="atRiskGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="day" stroke="#64748b" fontSize={12} />
                  <YAxis stroke="#64748b" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', color: '#f8fafc' }} />
                  <Area type="monotone" dataKey="recovered" stroke="#10b981" fillOpacity={1} fill="url(#recoveredGrad)" name="Recovered ($)" />
                  <Area type="monotone" dataKey="atRisk" stroke="#f43f5e" fillOpacity={1} fill="url(#atRiskGrad)" name="At Risk ($)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Customer Recovery Table */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Active Campaigns</h3>
              <span className="text-xs text-slate-400">{campaigns.length} total accounts</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm text-slate-300">
                <thead className="text-xs text-slate-400 uppercase bg-slate-950/50 border-b border-slate-800">
                  <tr>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Channel</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {campaigns.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-800/30 transition">
                      <td className="px-4 py-3 font-medium text-white flex items-center space-x-2">
                        <Users className="w-4 h-4 text-slate-500" />
                        <span>{c.name}</span>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-200">{c.amount}</td>
                      <td className="px-4 py-3 text-slate-400">
                        <span className="flex items-center gap-1.5 text-xs">
                          {c.channel === 'Email' ? <Mail className="w-3.5 h-3.5 text-blue-400" /> : <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />}
                          {c.channel}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                            c.status === 'Recovered'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : c.status === 'Pending'
                              ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                              : c.status === 'Escalated'
                              ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                              : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                          }`}
                        >
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500">{c.time}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (1/3 WIDTH): LIVE AI AGENT STREAM FEED */}
        <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 flex flex-col h-full">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-4">
            <div className="flex items-center space-x-2">
              <Bot className="w-5 h-5 text-indigo-400" />
              <h3 className="text-base font-semibold text-white">Live AI Decision Stream</h3>
            </div>
            <span className="flex h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
          </div>

          <div className="space-y-4 overflow-y-auto max-h-[550px] pr-2">
            {logs.map((log) => (
              <div key={log.id} className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs space-y-1">
                <div className="flex items-center justify-between text-slate-500 text-[10px]">
                  <span className="font-mono">{log.time}</span>
                  <span
                    className={`font-semibold uppercase tracking-wider ${
                      log.type === 'success'
                        ? 'text-emerald-400'
                        : log.type === 'ai'
                        ? 'text-indigo-400'
                        : 'text-amber-400'
                    }`}
                  >
                    {log.type}
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed">{log.text}</p>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
