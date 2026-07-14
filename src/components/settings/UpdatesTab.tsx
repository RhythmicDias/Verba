import React from "react";
import { RefreshCw, Check, Download } from "lucide-react";

export interface UpdatesTabProps {
  currentVersion: string;
  updateStatus: "idle" | "checking" | "available" | "downloading" | "installing" | "up-to-date" | "error";
  updateError: string | null;
  updateManifest: any | null;
  downloadProgress: number;
  checkForUpdates: (manual?: boolean) => void;
  installUpdate: () => void;
  setUpdateStatus: (status: any) => void;
}

export default function UpdatesTab({
  currentVersion,
  updateStatus,
  updateError,
  updateManifest,
  downloadProgress,
  checkForUpdates,
  installUpdate,
  setUpdateStatus,
}: UpdatesTabProps) {
  // Instead of a hardcoded "v2", use the major version dynamically or a default "v" icon
  const majorVersion = currentVersion.includes('.') ? currentVersion.split('.')[0] : '1';

  return (
    <div className="bg-[#eaecef] border border-[#d2d5db]/80 rounded-xl p-4 space-y-4 shadow-sm text-slate-800">
      <div className="flex items-center justify-between border-b border-[#d2d5db] pb-3">
        <div>
          <h3 className="text-xs font-bold text-[#23282f] tracking-wide uppercase">Application Updates</h3>
          <p className="text-[10px] text-slate-500 font-medium mt-1">
            Current Version: <span className="font-extrabold text-[#23282f]">{currentVersion}</span>
          </p>
        </div>
        <div className="w-9 h-9 rounded-full bg-[#23282f] flex items-center justify-center text-[#e8ff00] font-bold text-xs">
          v{majorVersion}
        </div>
      </div>

      {updateStatus === "idle" && (
        <div className="py-2 text-center space-y-3">
          <p className="text-[10px] text-slate-600">Check if there is a newer release of Verba available.</p>
          <button
            onClick={() => checkForUpdates(true)}
            className="bg-[#23282f] hover:bg-[#343b45] text-[11px] text-[#e8ff00] px-4 py-2 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
          >
            <RefreshCw size={12} /> Check for Updates
          </button>
        </div>
      )}

      {updateStatus === "checking" && (
        <div className="py-6 flex flex-col items-center justify-center gap-2">
          <RefreshCw size={20} className="text-[#23282f] animate-spin" />
          <p className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Checking for updates...</p>
        </div>
      )}

      {updateStatus === "up-to-date" && (
        <div className="py-4 text-center space-y-3">
          <div className="w-10 h-10 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto shadow-inner">
            <Check size={16} />
          </div>
          <div>
            <p className="text-[11px] font-bold text-slate-800">You are up to date!</p>
            <p className="text-[9px] text-slate-500 mt-1">Verba {currentVersion} is currently the newest version available.</p>
          </div>
          <button
            onClick={() => checkForUpdates(true)}
            className="border border-[#23282f] hover:bg-slate-100 text-[10px] text-[#23282f] px-4 py-1.5 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
          >
            <RefreshCw size={11} /> Check Again
          </button>
        </div>
      )}

      {updateStatus === "available" && updateManifest && (
        <div className="space-y-3">
          <div className="bg-[#23282f] text-white p-4 rounded-xl border border-[#343b45] space-y-2">
            <div className="flex justify-between items-center text-[11px]">
              <span className="font-bold text-[#e8ff00] uppercase tracking-wide">Update Available</span>
              <span className="text-[9px] bg-slate-800 px-2 py-0.5 rounded font-mono">v{updateManifest.version}</span>
            </div>
            {updateManifest.body && (
              <div className="text-[10px] text-slate-300 leading-relaxed border-t border-[#343b45]/60 pt-2 font-medium italic">
                {updateManifest.body}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <button
              onClick={() => setUpdateStatus("idle")}
              className="border border-slate-300 hover:bg-slate-100 text-[10px] text-slate-700 px-3 py-1 rounded-full font-bold transition-all cursor-pointer"
            >
              Later
            </button>
            <button
              onClick={installUpdate}
              className="bg-green-600 hover:bg-green-500 text-[10px] text-white px-4 py-1 rounded-full font-bold transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
            >
              <Download size={11} /> Update Now
            </button>
          </div>
        </div>
      )}

      {(updateStatus === "downloading" || updateStatus === "installing") && (
        <div className="py-4 space-y-3">
          <div className="flex justify-between text-[11px] font-bold text-slate-700">
            <span>{updateStatus === "downloading" ? "Downloading update..." : "Installing update..."}</span>
            {updateStatus === "downloading" && <span>{downloadProgress}%</span>}
          </div>
          <div className="w-full bg-slate-200 rounded-full h-1.5 shadow-inner overflow-hidden">
            <div
              className="bg-green-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${updateStatus === "downloading" ? downloadProgress : 100}%` }}
            />
          </div>
          <p className="text-[9px] text-slate-500 italic text-center">
            {updateStatus === "downloading"
              ? "Retrieving update files from secure release servers..."
              : "Applying updates. The application will restart automatically."}
          </p>
        </div>
      )}

      {updateStatus === "error" && (
        <div className="py-2 space-y-3 text-center">
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-[11px] text-red-700 leading-relaxed max-w-md mx-auto shadow-sm">
            <p className="font-bold">Check Failed</p>
            <p className="text-[9px] mt-1 text-red-600/90 font-mono break-all">{updateError}</p>
          </div>
          <button
            onClick={() => checkForUpdates(true)}
            className="bg-[#23282f] hover:bg-[#343b45] text-[10px] text-[#e8ff00] px-4 py-1.5 rounded-full font-bold transition-all shadow-sm flex items-center gap-2 mx-auto cursor-pointer"
          >
            <RefreshCw size={11} /> Try Again
          </button>
        </div>
      )}
    </div>
  );
}
