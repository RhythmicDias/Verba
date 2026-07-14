import React from "react";
import { Trash2, Copy } from "lucide-react";

export interface HistoryEntry {
  id: string;
  before: string;
  after: string;
  timestamp: string;
  provider: string;
  style: string;
  duration_ms?: number;
  model?: string;
}

interface HistoryTabProps {
  history: HistoryEntry[];
  clearAllHistory: () => void;
  deleteHistoryItem: (id: string) => void;
  copyToClipboard: (text: string) => void;
}

export default function HistoryTab({
  history,
  clearAllHistory,
  deleteHistoryItem,
  copyToClipboard,
}: HistoryTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-white">
        <p className="text-xs text-slate-100 font-medium">
          Total logged adjustments: <strong className="text-[#e8ff00] font-extrabold">{history.length}</strong>
        </p>
        {history.length > 0 && (
          <button
            onClick={clearAllHistory}
            className="text-xs font-bold text-red-200 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <Trash2 size={13} /> Clear Log History
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-6 text-center text-slate-500 text-xs shadow-sm">
          No local history recorded yet. Polish any text to write to this dashboard.
        </div>
      ) : (
        <div className="space-y-3">
          {history.map((item) => (
            <div
              key={item.id}
              className="bg-[#23282f] border border-[#343b45]/45 rounded-xl p-4 space-y-3 relative text-slate-200 shadow-md"
            >
              <div className="flex items-center justify-between text-[9px] text-slate-400 font-semibold border-b border-[#343b45]/40 pb-2">
                <div className="flex items-center gap-3">
                  <span className="capitalize px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[#e8ff00] font-bold">
                    {item.style}
                  </span>
                  <span className="uppercase tracking-wider text-slate-400 font-bold">{item.provider}</span>
                  {item.model && (
                    <span className="text-slate-500 font-bold uppercase tracking-wider">• {item.model}</span>
                  )}
                  {item.duration_ms !== undefined && item.duration_ms !== null && (
                    <span className="text-slate-500 font-bold">({(item.duration_ms / 1000).toFixed(1)}s)</span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span>{new Date(item.timestamp).toLocaleString()}</span>
                  <button
                    onClick={() => deleteHistoryItem(item.id)}
                    className="text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Before</span>
                    <button onClick={() => copyToClipboard(item.before)} className="text-slate-500 hover:text-white">
                      <Copy size={10} />
                    </button>
                  </div>
                  <div className="bg-slate-900/50 p-2.5 rounded-lg border border-slate-800 max-h-24 overflow-y-auto text-slate-300 whitespace-pre-wrap select-text italic">
                    {item.before}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider text-[#e8ff00]">
                      After
                    </span>
                    <button onClick={() => copyToClipboard(item.after)} className="text-slate-500 hover:text-white">
                      <Copy size={10} />
                    </button>
                  </div>
                  <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800 text-white max-h-24 overflow-y-auto whitespace-pre-wrap select-text font-medium">
                    {item.after}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
