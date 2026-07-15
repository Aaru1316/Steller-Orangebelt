import React, { useEffect, useState } from 'react';
import type { CampaignInfo, SorobanEvent } from '../utils/soroban';
import { getCampaignCount, getCampaign, fetchEvents } from '../utils/soroban';
import { CampaignCard } from '../components/CampaignCard';
import { Search, Flame, Shield, Users, Terminal, ArrowUpRight, Compass } from 'lucide-react';

interface HomeProps {
    onViewCampaign: (id: number) => void;
    setCurrentPage: (page: string) => void;
}

export const Home: React.FC<HomeProps> = ({ onViewCampaign, setCurrentPage }) => {
    const [campaigns, setCampaigns] = useState<CampaignInfo[]>([]);
    const [events, setEvents] = useState<SorobanEvent[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [lastLedger, setLastLedger] = useState(0);

    // Fetch campaigns
    const loadCampaigns = async () => {
        setIsLoading(true);
        try {
            const count = await getCampaignCount();
            const list: CampaignInfo[] = [];
            for (let i = 1; i <= count; i++) {
                const info = await getCampaign(i);
                if (info) {
                    list.push(info);
                }
            }
            setCampaigns(list.reverse()); // Show newest campaigns first
        } catch (err) {
            console.error('Failed to load campaigns:', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadCampaigns();
    }, []);

    // Poll for Soroban Events in real-time
    useEffect(() => {
        let isMounted = true;
        const pollEvents = async () => {
            try {
                const { events: newEvents, latestLedger } = await fetchEvents(lastLedger);
                if (!isMounted) return;

                if (newEvents.length > 0) {
                    setEvents(prev => {
                        // Merge and filter duplicates
                        const merged = [...newEvents, ...prev];
                        const unique = merged.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
                        return unique.slice(0, 30); // Keep last 30 events
                    });
                }
                setLastLedger(latestLedger + 1);
            } catch (err) {
                console.error('Error polling events:', err);
            }
        };

        pollEvents();
        const interval = setInterval(pollEvents, 10000); // poll every 10 seconds

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, [lastLedger]);

    const filteredCampaigns = campaigns.filter(c => {
        const matchesSearch = c.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                              c.description.toLowerCase().includes(searchQuery.toLowerCase());
        
        const isExpired = Number(c.deadline) * 1000 <= Date.now();
        const isFunded = c.total_pledged >= c.funding_goal;

        if (statusFilter === 'all') return matchesSearch;
        if (statusFilter === 'funding') return matchesSearch && !c.completed && !isExpired && !isFunded;
        if (statusFilter === 'voting') return matchesSearch && !c.completed && isFunded;
        if (statusFilter === 'completed') return matchesSearch && c.completed;
        if (statusFilter === 'failed') return matchesSearch && isExpired && !isFunded;

        return matchesSearch;
    });

    const formatEventMsg = (ev: SorobanEvent) => {
        const topicName = ev.topic[0] || 'event';
        
        // Formulate readable messages based on event topics
        if (topicName.includes('campaign_created')) {
            const campaignId = ev.topic[1] ? Number(ev.topic[1]) : '';
            return `Campaign #${campaignId} "${ev.value}" created by creator: ${ev.topic[2] ? ev.topic[2].substring(0, 6) : ''}...`;
        }
        if (topicName.includes('pledge_made')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Backer ${ev.topic[2] ? ev.topic[2].substring(0, 6) : ''}... pledged ${amountXlm} XLM to Campaign #${ev.topic[1]}`;
        }
        if (topicName.includes('milestone_approved')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Milestone #${ev.topic[2]} approved on Campaign #${ev.topic[1]}! Released ${amountXlm} XLM.`;
        }
        if (topicName.includes('campaign_completed')) {
            return `Campaign #${ev.topic[1]} successfully completed! Creator: ${ev.value ? ev.value.substring(0, 6) : ''}...`;
        }
        if (topicName.includes('refund_issued')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Backer ${ev.topic[2] ? ev.topic[2].substring(0, 6) : ''}... requested refund of ${amountXlm} XLM for Campaign #${ev.topic[1]}`;
        }
        if (topicName.includes('escrow_deposit')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Escrow: Deposited ${amountXlm} XLM by ${ev.topic[1] ? ev.topic[1].substring(0, 6) : ''}...`;
        }
        if (topicName.includes('escrow_release')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Escrow: Released ${amountXlm} XLM to creator ${ev.topic[1] ? ev.topic[1].substring(0, 6) : ''}...`;
        }
        if (topicName.includes('escrow_refund')) {
            const amountXlm = Number(BigInt(ev.value || 0n) / 10000000n);
            return `Escrow: Refunded ${amountXlm} XLM to backer ${ev.topic[1] ? ev.topic[1].substring(0, 6) : ''}...`;
        }

        return `Contract Action [${topicName}] recorded. Val: ${ev.value ? ev.value.toString() : ''}`;
    };

    return (
        <div className="space-y-16 py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
            {/* Hero Section */}
            <div className="relative rounded-3xl overflow-hidden bg-slate-950 border border-white/5 shadow-2xl p-8 sm:p-12 md:p-16 flex flex-col md:flex-row items-center justify-between gap-12">
                {/* Background light gradient */}
                <div className="absolute top-0 right-0 w-96 h-96 bg-brand-indigo/15 rounded-full filter blur-[100px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 w-96 h-96 bg-brand-cyan/10 rounded-full filter blur-[100px] pointer-events-none" />

                <div className="flex-1 space-y-6 text-left relative z-10">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-indigo/10 border border-brand-indigo/35 px-4 py-1.5 text-xs font-bold text-brand-cyan">
                        <Flame className="h-4 w-4 text-amber-400" /> Web3 Crowdfunding Evolution
                    </span>
                    <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-black leading-tight tracking-tight text-white m-0">
                        Pledge Securely.<br />
                        Release by <span className="bg-gradient-to-r from-brand-indigo to-brand-cyan bg-clip-text text-transparent">Milestones</span>.
                    </h1>
                    <p className="text-slate-400 text-lg leading-relaxed max-w-xl">
                        MilestoneFund locks backing assets in Escrow Smart Contracts. Creators only receive funds as backers vote to approve completed milestones, preventing rugpulls.
                    </p>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setCurrentPage('create')}
                            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-indigo to-brand-cyan px-6 py-3.5 text-base font-bold text-white shadow-lg shadow-brand-indigo/25 hover:shadow-brand-indigo/40 hover:opacity-95 transition-all cursor-pointer"
                        >
                            Launch Campaign <ArrowUpRight className="h-5 w-5" />
                        </button>
                        <a 
                            href="#campaigns-list"
                            className="flex items-center gap-2 rounded-xl bg-slate-900 border border-white/10 px-6 py-3.5 text-base font-bold text-white hover:bg-slate-800 transition-all"
                        >
                            Explore Campaigns
                        </a>
                    </div>
                </div>

                {/* Event stream terminal side widget */}
                <div className="w-full md:w-96 flex flex-col glass-effect rounded-2xl p-5 border border-white/10 shadow-lg shrink-0 relative z-10 h-72">
                    <div className="flex items-center gap-2 text-slate-300 font-bold border-b border-white/5 pb-3 mb-3">
                        <Terminal className="h-4 w-4 text-brand-cyan" />
                        <span className="font-mono text-xs">Live Blockchain Event Stream</span>
                    </div>
                    <div className="flex-1 overflow-y-auto font-mono text-[11px] text-slate-300 text-left space-y-2.5 pr-2 scrollbar-thin scrollbar-thumb-slate-800">
                        {events.length === 0 ? (
                            <div className="text-slate-500 italic py-8 text-center">Listening for contract events...</div>
                        ) : (
                            events.map((ev, index) => (
                                <div key={ev.id || index} className="flex gap-2 items-start leading-relaxed animate-fade-in border-b border-white/5 pb-1">
                                    <span className="text-brand-cyan font-bold">[{new Date(ev.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                                    <span>{formatEventMsg(ev)}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            </div>

            {/* Campaign Grid & Filtering */}
            <div id="campaigns-list" className="space-y-8 scroll-mt-20">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div className="text-left">
                        <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                            <Compass className="h-6 w-6 text-brand-indigo" /> Explore Active Campaigns
                        </h2>
                        <p className="text-slate-400 text-sm">Discover milestone-secured crowdfunding campaigns on Stellar.</p>
                    </div>

                    <div className="w-full md:w-auto flex flex-col sm:flex-row gap-3">
                        {/* Search */}
                        <div className="relative flex-1 sm:w-64">
                            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search campaign name..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/60 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30 transition-all placeholder:text-slate-500"
                            />
                        </div>

                        {/* Status Filter */}
                        <div className="flex bg-slate-900 border border-white/10 rounded-xl p-1 text-xs font-semibold overflow-x-auto shrink-0">
                            {[
                                { id: 'all', label: 'All' },
                                { id: 'funding', label: 'Funding' },
                                { id: 'voting', label: 'Voting' },
                                { id: 'completed', label: 'Completed' },
                                { id: 'failed', label: 'Failed' }
                            ].map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => setStatusFilter(filter.id)}
                                    className={`px-3.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                        statusFilter === filter.id
                                            ? 'bg-brand-indigo text-white shadow-md'
                                            : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* List grid */}
                {isLoading ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[1, 2, 3].map(i => (
                            <div key={i} className="glass-effect rounded-2xl h-80 animate-shimmer" />
                        ))}
                    </div>
                ) : filteredCampaigns.length === 0 ? (
                    <div className="glass-effect rounded-2xl p-16 text-center border border-white/5 space-y-4">
                        <Users className="h-12 w-12 text-slate-500 mx-auto" />
                        <h3 className="font-display text-xl font-bold text-white">No campaigns found</h3>
                        <p className="text-slate-400 text-sm max-w-sm mx-auto">
                            There are currently no campaigns matching your filters. Connect your wallet and launch the first one!
                        </p>
                        <button
                            onClick={() => setCurrentPage('create')}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-brand-indigo to-brand-cyan text-sm font-semibold text-white shadow-md cursor-pointer"
                        >
                            Launch First Campaign
                        </button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredCampaigns.map(c => (
                            <CampaignCard
                                key={c.id}
                                campaign={c}
                                onViewDetails={onViewCampaign}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Why platform info features */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8 border-t border-white/5">
                {[
                    {
                        icon: <Shield className="h-6 w-6 text-brand-indigo" />,
                        title: "Escrow Protected",
                        desc: "Funds are locked safely in a custom campaign Escrow contract until backers approve milestone releases."
                    },
                    {
                        icon: <Users className="h-6 w-6 text-brand-cyan" />,
                        title: "Decentralized Governance",
                        desc: "Your voice is tied to your pledge. Pledging more gives you proportional voting power over milestone approvals."
                    },
                    {
                        icon: <Flame className="h-6 w-6 text-brand-violet" />,
                        title: "Real-Time Event Stream",
                        desc: "Every contract transaction emits instant event logs. Follow milestones, pledges, and voting actions live."
                    }
                ].map((feat, i) => (
                    <div key={i} className="glass-effect rounded-2xl p-6 text-left border border-white/5">
                        <div className="rounded-lg bg-slate-900 border border-white/10 w-fit p-2.5 mb-4 shadow-sm">
                            {feat.icon}
                        </div>
                        <h3 className="text-base font-bold text-slate-100 mb-1 font-display">{feat.title}</h3>
                        <p className="text-xs text-slate-400 leading-relaxed">{feat.desc}</p>
                    </div>
                ))}
            </div>
        </div>
    );
};
