import React, { useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import type { CampaignInfo } from '../utils/soroban';
import { 
    getCampaign, 
    getBackerPledge, 
    hasVoted, 
    pledgeTx, 
    voteMilestoneTx, 
    refundTx
} from '../utils/soroban';
import { 
    ArrowLeft, 
    Award, 
    Users, 
    Coins, 
    CheckCircle2, 
    AlertTriangle, 
    Check, 
    XCircle,
    Clock,
    RefreshCw
} from 'lucide-react';

interface CampaignDetailsProps {
    campaignId: number;
    onBack: () => void;
}

export const CampaignDetails: React.FC<CampaignDetailsProps> = ({ campaignId, onBack }) => {
    const { address, signTx } = useWallet();
    
    const [campaign, setCampaign] = useState<CampaignInfo | null>(null);
    const [backerPledge, setBackerPledge] = useState<bigint>(0n);
    const [userVoted, setUserVoted] = useState<boolean>(false);
    
    const [isLoading, setIsLoading] = useState(true);
    const [txLoadingMsg, setTxLoadingMsg] = useState<string | null>(null);
    const [txError, setTxError] = useState<string | null>(null);
    const [txSuccess, setTxSuccess] = useState<string | null>(null);
    
    const [pledgeAmount, setPledgeAmount] = useState('');

    const STROOP = 10000000n;

    const loadCampaignDetails = async () => {
        setIsLoading(true);
        try {
            const data = await getCampaign(campaignId);
            setCampaign(data);

            if (data && address) {
                const pledge = await getBackerPledge(campaignId, address);
                setBackerPledge(pledge);

                const voted = await hasVoted(campaignId, data.current_milestone, address);
                setUserVoted(voted);
            }
        } catch (err) {
            console.error('Error fetching campaign details:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCampaignDetails();
    }, [campaignId, address]);

    if (isLoading) {
        return (
            <div className="py-24 text-center max-w-lg mx-auto space-y-4">
                <RefreshCw className="h-10 w-10 text-brand-cyan animate-spin mx-auto" />
                <p className="text-slate-400 font-medium">Fetching blockchain state for Campaign #{campaignId}...</p>
            </div>
        );
    }

    if (!campaign) {
        return (
            <div className="py-24 text-center max-w-lg mx-auto space-y-4">
                <AlertTriangle className="h-12 w-12 text-rose-500 mx-auto" />
                <h3 className="text-xl font-bold text-white">Campaign not found</h3>
                <p className="text-slate-450 text-sm">We couldn't retrieve campaign #{campaignId} from the ledger.</p>
                <button onClick={onBack} className="flex items-center gap-2 mx-auto text-brand-indigo font-bold hover:text-brand-cyan transition-all">
                    <ArrowLeft className="h-4 w-4" /> Back to campaigns
                </button>
            </div>
        );
    }

    const goalXlm = Number(campaign.funding_goal / STROOP);
    const pledgedXlm = Number(campaign.total_pledged / STROOP);
    const progressPercent = Math.min(100, Math.round((pledgedXlm / (goalXlm || 1)) * 100));

    const isExpired = Number(campaign.deadline) * 1000 <= Date.now();
    const isFunded = campaign.total_pledged >= campaign.funding_goal;

    const formatAddress = (addr: string) => {
        return `${addr.substring(0, 8)}...${addr.substring(addr.length - 8)}`;
    };

    const handlePledge = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!address) {
            setTxError('Please connect your wallet first.');
            return;
        }

        const amountFloat = parseFloat(pledgeAmount);
        if (isNaN(amountFloat) || amountFloat <= 0) {
            setTxError('Please enter a valid positive XLM amount.');
            return;
        }

        // Convert to Stroop (BigInt)
        const amountBigInt = BigInt(Math.round(amountFloat * 10000000));
        
        setTxError(null);
        setTxSuccess(null);
        setTxLoadingMsg('Pledging funds & initiating Escrow deposit. Please sign in Freighter...');

        try {
            const hash = await pledgeTx(address, campaignId, amountBigInt, signTx);
            setTxSuccess(`Success! Pledged ${amountFloat} XLM. Transaction hash: ${hash.substring(0, 12)}...`);
            setPledgeAmount('');
            await loadCampaignDetails();
        } catch (err: any) {
            console.error('Pledge transaction failed:', err);
            setTxError(err.message || 'Transaction rejected or failed.');
        } finally {
            setTxLoadingMsg(null);
        }
    };

    const handleVote = async (approve: boolean) => {
        if (!address) {
            setTxError('Please connect your wallet first.');
            return;
        }

        if (backerPledge <= 0n) {
            setTxError('Only backers who pledged to this campaign can vote.');
            return;
        }

        setTxError(null);
        setTxSuccess(null);
        setTxLoadingMsg(`Submitting vote (${approve ? 'YES' : 'NO'}) with weight ${Number(backerPledge / STROOP)} XLM...`);

        try {
            const hash = await voteMilestoneTx(address, campaignId, approve, signTx);
            setTxSuccess(`Vote successfully cast! Transaction hash: ${hash.substring(0, 12)}...`);
            await loadCampaignDetails();
        } catch (err: any) {
            console.error('Voting failed:', err);
            setTxError(err.message || 'Transaction failed.');
        } finally {
            setTxLoadingMsg(null);
        }
    };

    const handleRefund = async () => {
        if (!address) {
            setTxError('Please connect your wallet first.');
            return;
        }

        if (backerPledge <= 0n) {
            setTxError('No pledge balance found to refund.');
            return;
        }

        setTxError(null);
        setTxSuccess(null);
        setTxLoadingMsg('Issuing refund from Escrow Contract. Please sign in Freighter...');

        try {
            const hash = await refundTx(address, campaignId, signTx);
            setTxSuccess(`Refund of ${Number(backerPledge / STROOP)} XLM completed. Transaction: ${hash.substring(0, 12)}...`);
            await loadCampaignDetails();
        } catch (err: any) {
            console.error('Refund transaction failed:', err);
            setTxError(err.message || 'Transaction failed.');
        } finally {
            setTxLoadingMsg(null);
        }
    };

    const currentMilestoneIndex = campaign.current_milestone;

    return (
        <div className="space-y-8 py-8 px-4 sm:px-6 lg:px-8 max-w-6xl mx-auto text-left">
            {/* Back Button */}
            <button 
                onClick={onBack}
                className="flex items-center gap-2 text-slate-450 hover:text-white transition-colors border border-white/5 bg-slate-950/60 rounded-xl px-4 py-2 text-sm font-semibold cursor-pointer"
            >
                <ArrowLeft className="h-4 w-4" /> Back to campaigns
            </button>

            {/* Notification Toasts */}
            {txLoadingMsg && (
                <div className="rounded-xl border border-cyan-500/30 bg-slate-900 px-5 py-4 text-sm text-cyan-400 flex items-center gap-3 shadow-md glow-cyan animate-pulse">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>{txLoadingMsg}</span>
                </div>
            )}
            {txError && (
                <div className="rounded-xl border border-rose-500/30 bg-slate-900 px-5 py-4 text-sm text-rose-450 flex items-center gap-3 shadow-md">
                    <XCircle className="h-5 w-5 text-rose-400" />
                    <span>{txError}</span>
                </div>
            )}
            {txSuccess && (
                <div className="rounded-xl border border-emerald-500/30 bg-slate-900 px-5 py-4 text-sm text-emerald-450 flex items-center gap-3 shadow-md">
                    <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                    <span>{txSuccess}</span>
                </div>
            )}

            {/* Campaign Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Side: General Campaign info */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="glass-effect rounded-3xl p-8 space-y-6">
                        <div>
                            <h1 className="font-display text-3xl sm:text-4xl font-bold text-white m-0">
                                {campaign.title}
                            </h1>
                            <div className="flex flex-wrap items-center gap-6 mt-4 text-xs text-slate-400">
                                <span className="font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5">
                                    Creator: {formatAddress(campaign.creator)}
                                </span>
                                <span className="font-mono bg-slate-900 px-3 py-1.5 rounded-lg border border-white/5">
                                    Escrow: {formatAddress(campaign.escrow)}
                                </span>
                            </div>
                        </div>

                        <div className="border-t border-white/5 pt-6 space-y-4">
                            <h3 className="font-display text-lg font-bold text-slate-200">About this Project</h3>
                            <p className="text-slate-400 text-sm leading-relaxed whitespace-pre-line">
                                {campaign.description}
                            </p>
                        </div>

                        {/* Progress display */}
                        <div className="border-t border-white/5 pt-6 space-y-3">
                            <div className="flex justify-between items-end">
                                <div className="space-y-0.5">
                                    <span className="text-xs text-slate-400 font-semibold block">TOTAL PLEDGED</span>
                                    <span className="font-mono text-2xl font-black text-white">{pledgedXlm.toLocaleString()} XLM</span>
                                </div>
                                <div className="text-right space-y-0.5">
                                    <span className="text-xs text-slate-400 font-semibold block">FUNDING GOAL</span>
                                    <span className="font-mono text-lg font-bold text-slate-300">{goalXlm.toLocaleString()} XLM</span>
                                </div>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-white/5">
                                <div 
                                    className="bg-gradient-to-r from-brand-indigo to-brand-cyan h-full rounded-full progress-bar-glow" 
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                            <div className="flex justify-between text-xs text-slate-500">
                                <span>{progressPercent}% reached</span>
                                <span>Time limit: {new Date(Number(campaign.deadline) * 1000).toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    {/* Milestones Roadmaps */}
                    <div className="glass-effect rounded-3xl p-8 space-y-6">
                        <h2 className="font-display text-xl font-bold text-white flex items-center gap-2 m-0">
                            <Award className="h-5.5 w-5.5 text-brand-cyan" /> Project Milestones Timeline
                        </h2>
                        
                        <div className="relative border-l border-white/10 pl-6 ml-3 space-y-8">
                            {campaign.milestones.map((m, index) => {
                                const isCurrent = index === currentMilestoneIndex;
                                const isPassed = index < currentMilestoneIndex;
                                const amountXlm = Number(m.amount / STROOP);

                                let dotIcon = <Clock className="h-4.5 w-4.5 text-slate-600" />;
                                let dotColor = "bg-slate-900 border-slate-700";

                                if (isPassed || m.approved) {
                                    dotIcon = <Check className="h-4 w-4 text-emerald-400" />;
                                    dotColor = "bg-slate-950 border-emerald-500/60 shadow-[0_0_10px_rgba(16,185,129,0.3)]";
                                } else if (isCurrent && !campaign.completed) {
                                    dotIcon = <RefreshCw className="h-4 w-4 text-brand-cyan animate-spin" />;
                                    dotColor = "bg-slate-950 border-brand-cyan shadow-[0_0_10px_rgba(6,182,212,0.3)]";
                                }

                                return (
                                    <div key={index} className="relative">
                                        {/* Point indicator */}
                                        <div className={`absolute -left-10 top-1.5 flex h-7.5 w-7.5 items-center justify-center rounded-full border ${dotColor}`}>
                                            {dotIcon}
                                        </div>

                                        <div className={`rounded-2xl p-5 border transition-all ${
                                            isCurrent && !campaign.completed
                                                ? 'bg-brand-indigo/5 border-brand-indigo/40 shadow-sm'
                                                : 'bg-slate-900/40 border-white/5'
                                        }`}>
                                            <div className="flex justify-between items-start gap-4">
                                                <div>
                                                    <span className="text-[10px] font-bold text-brand-indigo tracking-wider uppercase">
                                                        MILESTONE #{index + 1}
                                                    </span>
                                                    <h4 className={`text-base font-bold mt-1 ${isPassed || m.approved ? 'text-slate-400 line-through' : 'text-slate-200'}`}>
                                                        {m.description}
                                                    </h4>
                                                </div>
                                                <span className="font-mono text-sm font-bold text-brand-cyan bg-brand-cyan/5 border border-brand-cyan/20 px-3 py-1 rounded-xl shrink-0">
                                                    {amountXlm.toLocaleString()} XLM
                                                </span>
                                            </div>

                                            {/* Show votes weight if it's the current active milestone and goal was successfully funded */}
                                            {isCurrent && isFunded && isExpired && !campaign.completed && (
                                                <div className="mt-4 pt-4 border-t border-white/5 flex flex-wrap justify-between items-center gap-4">
                                                    <span className="text-xs text-slate-400 font-semibold uppercase">ACTIVE VOTING POWER</span>
                                                    <div className="flex gap-4 text-xs font-mono">
                                                        <span className="text-emerald-400">YES: {Number(m.votes_for / STROOP)} XLM</span>
                                                        <span className="text-rose-400">NO: {Number(m.votes_against / STROOP)} XLM</span>
                                                        <span className="text-slate-400">THRESHOLD: &gt;{Number(campaign.total_pledged / STROOP) / 2} XLM</span>
                                                    </div>
                                                </div>
                                            )}

                                            {isPassed && (
                                                <div className="mt-2 text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                                                    <CheckCircle2 className="h-3.5 w-3.5" /> Milestone Approved & Funds Released
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Right Side: Backer widgets (Pledge, vote status) */}
                <div className="space-y-8">
                    {/* Your Balance widget */}
                    {address && (
                        <div className="glass-effect rounded-3xl p-6 border-l-4 border-brand-indigo">
                            <h4 className="text-xs text-slate-400 font-bold uppercase tracking-wider">YOUR CAMPAIGN BALANCE</h4>
                            <div className="mt-2 flex justify-between items-baseline">
                                <span className="font-mono text-2xl font-black text-white">
                                    {Number(backerPledge / STROOP).toLocaleString()}
                                </span>
                                <span className="text-xs font-semibold text-slate-400">XLM Pledged</span>
                            </div>
                        </div>
                    )}

                    {/* Pledge Widget */}
                    {!campaign.completed && !isExpired && (
                        <div className="glass-effect rounded-3xl p-6 space-y-4">
                            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2 m-0">
                                <Coins className="h-5 w-5 text-brand-indigo" /> Support this Project
                            </h3>
                            <p className="text-slate-400 text-xs leading-relaxed">
                                Enter the amount of XLM you wish to pledge. Funds are held in Escrow and released to the creator ONLY when milestones are met.
                            </p>

                            <form onSubmit={handlePledge} className="space-y-3">
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.00001"
                                        placeholder="Pledge amount (e.g. 50)"
                                        value={pledgeAmount}
                                        onChange={(e) => setPledgeAmount(e.target.value)}
                                        className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-200 font-mono text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                        required
                                    />
                                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                                        XLM
                                    </span>
                                </div>
                                <button
                                    type="submit"
                                    disabled={!!txLoadingMsg}
                                    className="w-full py-3 rounded-xl bg-gradient-to-r from-brand-indigo to-brand-cyan text-sm font-bold text-white shadow-md shadow-brand-indigo/15 hover:opacity-95 transition-all cursor-pointer disabled:opacity-50"
                                >
                                    Pledge XLM
                                </button>
                            </form>
                        </div>
                    )}

                    {/* Voting Panel */}
                    {!campaign.completed && isFunded && isExpired && (
                        <div className="glass-effect rounded-3xl p-6 space-y-4">
                            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2 m-0">
                                <Users className="h-5 w-5 text-brand-cyan" /> Milestone Approval Voting
                            </h3>
                            <p className="text-slate-400 text-xs leading-relaxed">
                                The current milestone <strong>#{currentMilestoneIndex + 1}</strong> is awaiting approval. Backers vote proportional to their pledge weight.
                            </p>

                            {backerPledge <= 0n ? (
                                <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-xs text-amber-300 flex gap-2">
                                    <AlertTriangle className="h-5 w-5 shrink-0" />
                                    <span>Only backers who pledged to this campaign before the deadline can vote.</span>
                                </div>
                            ) : userVoted ? (
                                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-xs text-emerald-300 flex items-center gap-2">
                                    <Check className="h-5 w-5 shrink-0" />
                                    <span>You have already cast your vote for this milestone! Waiting for others...</span>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <button
                                        onClick={() => handleVote(true)}
                                        disabled={!!txLoadingMsg}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <Check className="h-4.5 w-4.5" /> Approve Milestone (YES)
                                    </button>
                                    <button
                                        onClick={() => handleVote(false)}
                                        disabled={!!txLoadingMsg}
                                        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-600 hover:bg-rose-505 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
                                    >
                                        <XCircle className="h-4.5 w-4.5" /> Reject Milestone (NO)
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Refund Panel (Funding Goal not met & expired) */}
                    {isExpired && !isFunded && (
                        <div className="glass-effect rounded-3xl p-6 space-y-4">
                            <h3 className="font-display text-lg font-bold text-white flex items-center gap-2 m-0">
                                <AlertTriangle className="h-5 w-5 text-rose-500" /> Refund Available
                            </h3>
                            <p className="text-slate-400 text-xs leading-relaxed">
                                The project deadline passed without meeting the funding goal. All backers are eligible for a 100% refund of their locked XLM.
                            </p>

                            {backerPledge <= 0n ? (
                                <div className="text-slate-500 text-xs italic py-2 text-center">
                                    No locked balance or refund already claimed.
                                </div>
                            ) : (
                                <button
                                    onClick={handleRefund}
                                    disabled={!!txLoadingMsg}
                                    className="w-full py-3 rounded-xl bg-rose-600 hover:bg-rose-550 text-sm font-bold text-white shadow-md transition-all cursor-pointer disabled:opacity-50"
                                >
                                    Claim Refund ({Number(backerPledge / STROOP).toLocaleString()} XLM)
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
