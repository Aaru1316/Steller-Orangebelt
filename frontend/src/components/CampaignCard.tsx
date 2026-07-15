import React from 'react';
import type { CampaignInfo } from '../utils/soroban';
import { Calendar, Award, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface CampaignCardProps {
    campaign: CampaignInfo;
    onViewDetails: (id: number) => void;
}

export const CampaignCard: React.FC<CampaignCardProps> = ({ campaign, onViewDetails }) => {
    // 1 XLM = 10,000,000 stroops (represented as 7 decimals in BigInt, 10^7)
    const STROOP = 10000000n;
    
    const goalXlm = Number(campaign.funding_goal / STROOP);
    const pledgedXlm = Number(campaign.total_pledged / STROOP);
    const progressPercent = Math.min(100, Math.round((pledgedXlm / (goalXlm || 1)) * 100));

    const isExpired = Number(campaign.deadline) * 1000 <= Date.now();
    const isFunded = campaign.total_pledged >= campaign.funding_goal;
    
    let statusBadge = null;
    if (campaign.completed) {
        statusBadge = (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 text-xs font-semibold text-emerald-400">
                <CheckCircle2 className="h-3 w-3" /> Completed
            </span>
        );
    } else if (isExpired) {
        if (isFunded) {
            statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 px-2.5 py-1 text-xs font-semibold text-indigo-400">
                    <RefreshCw className="h-3 w-3 animate-spin" /> Voting Milestones
                </span>
            );
        } else {
            statusBadge = (
                <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-400">
                    <AlertCircle className="h-3 w-3" /> Failed
                </span>
            );
        }
    } else {
        statusBadge = (
            <span className="inline-flex items-center gap-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 px-2.5 py-1 text-xs font-semibold text-cyan-400">
                <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" /> Funding
            </span>
        );
    }

    const formattedDeadline = new Date(Number(campaign.deadline) * 1000).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
    });

    const approvedMilestones = campaign.milestones.filter(m => m.approved).length;

    return (
        <div className="glass-effect glass-effect-hover flex flex-col rounded-2xl overflow-hidden shadow-xl">
            {/* Header section */}
            <div className="p-6 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4">
                    {statusBadge}
                    <div className="flex items-center gap-1 text-slate-400 text-xs font-medium">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Deadline: {formattedDeadline}</span>
                    </div>
                </div>

                <h3 className="font-display text-xl font-bold text-white mb-2 line-clamp-1">
                    {campaign.title}
                </h3>
                
                <p className="text-slate-400 text-sm leading-relaxed mb-6 line-clamp-2">
                    {campaign.description}
                </p>

                {/* Progress bar */}
                <div className="mt-auto space-y-2">
                    <div className="flex justify-between items-end text-xs font-semibold">
                        <span className="text-slate-400">Pledged: <span className="text-white font-mono">{pledgedXlm.toLocaleString()} XLM</span></span>
                        <span className="text-brand-cyan font-mono">{progressPercent}%</span>
                    </div>
                    <div className="w-full bg-slate-800/80 rounded-full h-2 overflow-hidden border border-white/5">
                        <div 
                            className="bg-gradient-to-r from-brand-indigo to-brand-cyan h-full rounded-full progress-bar-glow transition-all duration-500" 
                            style={{ width: `${progressPercent}%` }}
                        />
                    </div>
                    <div className="flex justify-between text-[11px] text-slate-500">
                        <span>Goal: {goalXlm.toLocaleString()} XLM</span>
                        <span>{(pledgedXlm / goalXlm * 100).toFixed(0)}% reached</span>
                    </div>
                </div>
            </div>

            {/* Footer section */}
            <div className="border-t border-white/10 px-6 py-4 bg-slate-950/40 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs text-slate-400 font-semibold">
                    <Award className="h-4 w-4 text-brand-indigo" />
                    <span>
                        Milestones: <span className="text-slate-200 font-mono">{approvedMilestones}/{campaign.milestones.length}</span>
                    </span>
                </div>
                <button
                    onClick={() => onViewDetails(campaign.id)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-white/10 text-xs font-bold text-white hover:bg-slate-800 hover:border-brand-cyan/35 transition-all cursor-pointer"
                >
                    View Details
                </button>
            </div>
        </div>
    );
};
