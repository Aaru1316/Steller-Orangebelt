import React, { useEffect, useState } from 'react';
import { useWallet } from '../context/WalletContext';
import type { CampaignInfo } from '../utils/soroban';
import { getCampaignCount, getCampaign, getBackerPledge } from '../utils/soroban';
import { CampaignCard } from '../components/CampaignCard';
import { Landmark, Coins, Users, Info } from 'lucide-react';

interface DashboardProps {
    onViewCampaign: (id: number) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onViewCampaign }) => {
    const { address } = useWallet();

    const [launchedCampaigns, setLaunchedCampaigns] = useState<CampaignInfo[]>([]);
    const [backedCampaigns, setBackedCampaigns] = useState<CampaignInfo[]>([]);
    const [backedAmounts, setBackedAmounts] = useState<Record<number, bigint>>({});
    
    const [isLoading, setIsLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'launched' | 'backed'>('launched');

    const STROOP = 10000000n;

    const loadDashboardData = async () => {
        if (!address) return;
        setIsLoading(true);
        try {
            const count = await getCampaignCount();
            const launched: CampaignInfo[] = [];
            const backed: CampaignInfo[] = [];
            const pledgeMap: Record<number, bigint> = {};

            for (let i = 1; i <= count; i++) {
                const info = await getCampaign(i);
                if (info) {
                    // Check if creator
                    if (info.creator.toLowerCase() === address.toLowerCase()) {
                        launched.push(info);
                    }
                    
                    // Check if backer
                    const pledge = await getBackerPledge(i, address);
                    if (pledge > 0n) {
                        backed.push(info);
                        pledgeMap[i] = pledge;
                    }
                }
            }

            setLaunchedCampaigns(launched.reverse());
            setBackedCampaigns(backed.reverse());
            setBackedAmounts(pledgeMap);
        } catch (err) {
            console.error('Error fetching dashboard data:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadDashboardData();
    }, [address]);

    if (!address) {
        return (
            <div className="space-y-8 py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-left">
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white m-0">Creator & Backer Dashboard</h1>
                <div className="glass-effect rounded-3xl p-12 text-center border border-white/5 space-y-4">
                    <Info className="h-10 w-10 text-brand-indigo mx-auto" />
                    <h3 className="text-lg font-bold text-white font-display">Connect Wallet</h3>
                    <p className="text-slate-400 text-xs max-w-md mx-auto">
                        Please connect your Freighter Wallet to view campaigns you have launched or backed on the platform, and track your active milestones.
                    </p>
                </div>
            </div>
        );
    }

    // Calculate metrics
    const totalPledgedStroops = Object.values(backedAmounts).reduce((acc, curr) => acc + curr, 0n);
    const totalPledgedXlm = Number(totalPledgedStroops / STROOP);

    return (
        <div className="space-y-8 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-left animate-fade-in">
            {/* Header */}
            <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold text-white m-0">Creator & Backer Dashboard</h1>
                <p className="text-slate-450 text-sm">Monitor your campaigns, active milestones, and pledge balances on Testnet.</p>
            </div>

            {/* Metrics cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                {[
                    {
                        icon: <Landmark className="h-5 w-5 text-brand-indigo" />,
                        title: "Campaigns Launched",
                        value: launchedCampaigns.length
                    },
                    {
                        icon: <Users className="h-5 w-5 text-brand-cyan" />,
                        title: "Campaigns Backed",
                        value: backedCampaigns.length
                    },
                    {
                        icon: <Coins className="h-5 w-5 text-brand-violet" />,
                        title: "Total XLM Pledged",
                        value: `${totalPledgedXlm.toLocaleString()} XLM`
                    }
                ].map((metric, i) => (
                    <div key={i} className="glass-effect rounded-2xl p-6 flex items-center gap-4 border border-white/5 shadow-sm">
                        <div className="rounded-xl bg-slate-900 border border-white/10 p-3 shrink-0">
                            {metric.icon}
                        </div>
                        <div className="space-y-0.5">
                            <span className="text-xs text-slate-400 font-semibold uppercase">{metric.title}</span>
                            <span className="font-mono text-xl font-bold text-white block">{metric.value}</span>
                        </div>
                    </div>
                ))}
            </div>

            {/* Tab switchers */}
            <div className="border-b border-white/10 flex gap-6 text-sm font-semibold">
                <button
                    onClick={() => setActiveTab('launched')}
                    className={`pb-4 border-b-2 transition-all cursor-pointer ${
                        activeTab === 'launched'
                            ? 'border-brand-indigo text-white font-bold'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Launched Campaigns ({launchedCampaigns.length})
                </button>
                <button
                    onClick={() => setActiveTab('backed')}
                    className={`pb-4 border-b-2 transition-all cursor-pointer ${
                        activeTab === 'backed'
                            ? 'border-brand-indigo text-white font-bold'
                            : 'border-transparent text-slate-400 hover:text-slate-200'
                    }`}
                >
                    Backed Campaigns ({backedCampaigns.length})
                </button>
            </div>

            {/* Tab content */}
            {isLoading ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {[1, 2].map(i => (
                        <div key={i} className="glass-effect rounded-2xl h-80 animate-shimmer" />
                    ))}
                </div>
            ) : activeTab === 'launched' ? (
                launchedCampaigns.length === 0 ? (
                    <div className="glass-effect rounded-2xl p-16 text-center border border-white/5 space-y-3">
                        <Landmark className="h-10 w-10 text-slate-500 mx-auto" />
                        <h3 className="text-lg font-bold text-white font-display">No campaigns launched</h3>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto">
                            You have not launched any crowdfunding campaigns yet. Start a project and describe your milestones today!
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {launchedCampaigns.map(c => (
                            <CampaignCard
                                key={c.id}
                                campaign={c}
                                onViewDetails={onViewCampaign}
                            />
                        ))}
                    </div>
                )
            ) : (
                backedCampaigns.length === 0 ? (
                    <div className="glass-effect rounded-2xl p-16 text-center border border-white/5 space-y-3">
                        <Users className="h-10 w-10 text-slate-500 mx-auto" />
                        <h3 className="text-lg font-bold text-white font-display">No campaigns backed</h3>
                        <p className="text-slate-400 text-xs max-w-sm mx-auto">
                            You have not pledged to any campaigns yet. Explore the home page to support active projects.
                        </p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {backedCampaigns.map(c => (
                            <div key={c.id} className="relative">
                                {/* Small balance indicator badge */}
                                <div className="absolute top-3 left-3 z-10 rounded-lg bg-brand-indigo px-2.5 py-1 text-[10px] font-bold text-white shadow shadow-brand-indigo/35 border border-brand-indigo/30 uppercase">
                                    Your Pledge: {Number((backedAmounts[c.id] || 0n) / STROOP)} XLM
                                </div>
                                <CampaignCard
                                    campaign={c}
                                    onViewDetails={onViewCampaign}
                                />
                            </div>
                        ))}
                    </div>
                )
            )}
        </div>
    );
};
