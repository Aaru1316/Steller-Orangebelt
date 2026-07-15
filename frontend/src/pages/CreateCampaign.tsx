import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { deployEscrowContract, createCampaignTx } from '../utils/soroban';
import { 
    Plus, 
    Trash2, 
    Calendar, 
    Coins, 
    Award, 
    Info, 
    RefreshCw, 
    CheckCircle2, 
    XCircle,
    ChevronRight,
    Megaphone
} from 'lucide-react';

interface CreateCampaignProps {
    setCurrentPage: (page: string) => void;
}

interface MilestoneInput {
    description: string;
    amount: string;
}

export const CreateCampaign: React.FC<CreateCampaignProps> = ({ setCurrentPage }) => {
    const { address, signTx } = useWallet();

    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [fundingGoal, setFundingGoal] = useState('');
    const [deadline, setDeadline] = useState('');
    
    // Default native XLM token contract address on Testnet
    const [tokenAddress, setTokenAddress] = useState('CDLZFC3SYJYDATH7KSEYF2CHM6BYHDOP7LJMCHBAUPRBEKXP642KKMSO');
    
    const [milestones, setMilestones] = useState<MilestoneInput[]>([
        { description: 'Milestone 1: Prototype', amount: '' }
    ]);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState<string | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [successMsg, setSuccessMsg] = useState<string | null>(null);



    const handleAddMilestone = () => {
        setMilestones([...milestones, { description: `Milestone ${milestones.length + 1}: `, amount: '' }]);
    };

    const handleRemoveMilestone = (index: number) => {
        if (milestones.length === 1) return;
        const newMilestones = [...milestones];
        newMilestones.splice(index, 1);
        setMilestones(newMilestones);
    };

    const handleMilestoneChange = (index: number, field: keyof MilestoneInput, value: string) => {
        const newMilestones = [...milestones];
        newMilestones[index][field] = value;
        setMilestones(newMilestones);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErrorMsg(null);
        setSuccessMsg(null);

        if (!address) {
            setErrorMsg('Please connect your Freighter Wallet first.');
            return;
        }

        const goalFloat = parseFloat(fundingGoal);
        if (isNaN(goalFloat) || goalFloat <= 0) {
            setErrorMsg('Please enter a valid positive funding goal.');
            return;
        }

        const goalStroops = BigInt(Math.round(goalFloat * 10000000));

        // Validate milestones
        let milestoneStroopsSum = 0n;
        const parsedMilestones: { description: string; amount: bigint }[] = [];
        
        for (let i = 0; i < milestones.length; i++) {
            const m = milestones[i];
            if (!m.description.trim()) {
                setErrorMsg(`Please fill in the description for Milestone #${i + 1}`);
                return;
            }
            const mAmountFloat = parseFloat(m.amount);
            if (isNaN(mAmountFloat) || mAmountFloat <= 0) {
                setErrorMsg(`Please enter a valid amount for Milestone #${i + 1}`);
                return;
            }
            const amountStroops = BigInt(Math.round(mAmountFloat * 10000000));
            milestoneStroopsSum += amountStroops;
            parsedMilestones.push({
                description: m.description,
                amount: amountStroops
            });
        }

        if (milestoneStroopsSum !== goalStroops) {
            const currentSumXLM = Number(milestoneStroopsSum) / 10000000;
            setErrorMsg(`The sum of milestone allocations (${currentSumXLM} XLM) must exactly equal the total funding goal (${goalFloat} XLM).`);
            return;
        }

        const dateParts = deadline.split('-');
        let deadlineTimestamp = NaN;
        if (dateParts.length === 3) {
            const year = parseInt(dateParts[0], 10);
            const month = parseInt(dateParts[1], 10);
            const day = parseInt(dateParts[2], 10);
            const localDate = new Date(year, month - 1, day, 23, 59, 59);
            deadlineTimestamp = Math.floor(localDate.getTime() / 1000);
        }

        console.log('Debug - Raw deadline value from input:', deadline);
        console.log('Debug - Parsed deadlineTimestamp:', deadlineTimestamp);
        console.log('Debug - Current time timestamp:', Math.floor(Date.now() / 1000));

        if (isNaN(deadlineTimestamp) || deadlineTimestamp <= Math.floor(Date.now() / 1000)) {
            setErrorMsg('The campaign deadline must be set to a future date.');
            return;
        }

        setIsSubmitting(true);
        try {
            // Step 1: Deploy Escrow Contract
            setLoadingMessage('Step 1 of 2: Deploying unique Escrow Smart Contract instance... Please sign the transaction in Freighter.');
            const escrowAddress = await deployEscrowContract(address, signTx);
            console.log(`Successfully deployed Escrow at: ${escrowAddress}`);

            // Step 2: Create Campaign
            setLoadingMessage('Step 2 of 2: Registering campaign and locking Escrow... Please sign the transaction in Freighter.');
            const txHash = await createCampaignTx(
                address,
                escrowAddress,
                tokenAddress,
                title,
                description,
                goalStroops,
                BigInt(deadlineTimestamp),
                parsedMilestones,
                signTx
            );

            setSuccessMsg(`Success! Campaign launched successfully. Transaction Hash: ${txHash.substring(0, 15)}...`);
            setTitle('');
            setDescription('');
            setFundingGoal('');
            setDeadline('');
            setMilestones([{ description: 'Milestone 1: ', amount: '' }]);
            
            // Redirect after 3 seconds
            setTimeout(() => {
                setCurrentPage('dashboard');
            }, 3000);

        } catch (err: any) {
            console.error('Launch failed:', err);
            setErrorMsg(err.message || 'Escrow deployment or campaign creation rejected.');
        } finally {
            setIsSubmitting(false);
            setLoadingMessage(null);
        }
    };

    return (
        <div className="space-y-8 py-8 px-4 sm:px-6 lg:px-8 max-w-4xl mx-auto text-left">
            <div className="flex items-center gap-3">
                <div className="rounded-xl bg-brand-indigo/15 p-2.5 border border-brand-indigo/35">
                    <Megaphone className="h-6 w-6 text-brand-cyan" />
                </div>
                <div>
                    <h1 className="font-display text-2xl sm:text-3xl font-bold text-white m-0">Launch a New Campaign</h1>
                    <p className="text-slate-400 text-sm">Deploy an escrow-secured crowdfunding campaign with multiple milestones.</p>
                </div>
            </div>

            {/* Notifications */}
            {loadingMessage && (
                <div className="rounded-xl border border-cyan-500/30 bg-slate-900 px-5 py-4 text-sm text-cyan-400 flex items-center gap-3 shadow-md glow-cyan animate-pulse">
                    <RefreshCw className="h-5 w-5 animate-spin" />
                    <span>{loadingMessage}</span>
                </div>
            )}
            {errorMsg && (
                <div className="rounded-xl border border-rose-500/30 bg-slate-900 px-5 py-4 text-sm text-rose-450 flex items-center gap-3 shadow-md">
                    <XCircle className="h-5 w-5 text-rose-450" />
                    <span>{errorMsg}</span>
                </div>
            )}
            {successMsg && (
                <div className="rounded-xl border border-emerald-500/30 bg-slate-900 px-5 py-4 text-sm text-emerald-450 flex items-center gap-3 shadow-md">
                    <CheckCircle2 className="h-5 w-5 text-emerald-450" />
                    <span>{successMsg}</span>
                </div>
            )}

            {!address ? (
                <div className="glass-effect rounded-3xl p-12 text-center border border-white/5 space-y-4">
                    <Info className="h-10 w-10 text-brand-indigo mx-auto" />
                    <h3 className="text-lg font-bold text-white font-display">Wallet Disconnected</h3>
                    <p className="text-slate-400 text-xs max-w-md mx-auto">
                        Please connect your Freighter Wallet using the button in the top navigation bar to create and deploy crowdfunding campaigns.
                    </p>
                </div>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-8">
                    {/* General Campaign details */}
                    <div className="glass-effect rounded-3xl p-6 sm:p-8 space-y-6">
                        <h3 className="font-display text-lg font-bold text-white m-0 flex items-center gap-2 border-b border-white/5 pb-4">
                            <Info className="h-5 w-5 text-brand-indigo" /> 1. Campaign Details
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* Title */}
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Campaign Title</label>
                                <input
                                    type="text"
                                    placeholder="Enter project title"
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>

                            {/* Description */}
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Project Description</label>
                                <textarea
                                    rows={4}
                                    placeholder="Describe the campaign target, roadmap, and delivery criteria..."
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>

                            {/* Funding Goal */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Funding Goal (XLM)</label>
                                <div className="relative">
                                    <input
                                        type="number"
                                        step="0.00001"
                                        placeholder="Goal amount"
                                        value={fundingGoal}
                                        onChange={(e) => setFundingGoal(e.target.value)}
                                        className="w-full pl-4 pr-12 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-200 font-mono text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                        required
                                        disabled={isSubmitting}
                                    />
                                    <Coins className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                                </div>
                            </div>

                            {/* Deadline */}
                            <div className="space-y-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Funding Deadline</label>
                                <div className="relative">
                                    <input
                                        type="date"
                                        value={deadline}
                                        onChange={(e) => setDeadline(e.target.value)}
                                        className="w-full pl-4 pr-10 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                        required
                                        disabled={isSubmitting}
                                    />
                                    <Calendar className="absolute right-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500 pointer-events-none" />
                                </div>
                            </div>

                            {/* Token Contract address */}
                            <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                                    Stellar Token Contract Address
                                    <span className="text-[10px] bg-brand-cyan/15 text-brand-cyan border border-brand-cyan/25 px-2 py-0.5 rounded">Default: Native XLM</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="Enter stellar token address"
                                    value={tokenAddress}
                                    onChange={(e) => setTokenAddress(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl bg-slate-900 border border-white/10 text-slate-350 font-mono text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                    required
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Milestones timeline creator */}
                    <div className="glass-effect rounded-3xl p-6 sm:p-8 space-y-6">
                        <div className="flex items-center justify-between border-b border-white/5 pb-4">
                            <h3 className="font-display text-lg font-bold text-white m-0 flex items-center gap-2">
                                <Award className="h-5 w-5 text-brand-cyan" /> 2. Milestones Roadmap
                            </h3>
                            <button
                                type="button"
                                onClick={handleAddMilestone}
                                disabled={isSubmitting}
                                className="flex items-center gap-1 rounded-xl bg-brand-indigo/15 border border-brand-indigo/35 px-4.5 py-2 text-xs font-bold text-brand-cyan hover:bg-brand-indigo/25 cursor-pointer disabled:opacity-50"
                            >
                                <Plus className="h-4 w-4" /> Add Milestone
                            </button>
                        </div>

                        <p className="text-slate-400 text-xs leading-relaxed">
                            Define project milestones. Pledged funds are unlocked sequentially. Backers vote to approve the release of funds assigned to each milestone.
                        </p>

                        <div className="space-y-4">
                            {milestones.map((m, index) => (
                                <div key={index} className="flex flex-col sm:flex-row items-stretch gap-4 p-5 rounded-2xl bg-slate-900/60 border border-white/5">
                                    <div className="flex items-center justify-center rounded-xl bg-slate-950 font-mono text-xs font-bold border border-white/5 h-10 w-10 shrink-0">
                                        #{index + 1}
                                    </div>
                                    
                                    {/* Description */}
                                    <div className="flex-1 space-y-1 text-left">
                                        <input
                                            type="text"
                                            placeholder="e.g. Design completes, prototype testing, final launch"
                                            value={m.description}
                                            onChange={(e) => handleMilestoneChange(index, 'description', e.target.value)}
                                            className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-200 text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                            required
                                            disabled={isSubmitting}
                                        />
                                    </div>

                                    {/* Allocation amount */}
                                    <div className="w-full sm:w-44 space-y-1 relative shrink-0">
                                        <input
                                            type="number"
                                            step="0.00001"
                                            placeholder="XLM allocation"
                                            value={m.amount}
                                            onChange={(e) => handleMilestoneChange(index, 'amount', e.target.value)}
                                            className="w-full pl-4 pr-12 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-slate-200 font-mono text-sm focus:outline-none focus:border-brand-indigo/80 focus:ring-1 focus:ring-brand-indigo/30"
                                            required
                                            disabled={isSubmitting}
                                        />
                                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-500">
                                            XLM
                                        </span>
                                    </div>

                                    {/* Remove button */}
                                    {milestones.length > 1 && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveMilestone(index)}
                                            disabled={isSubmitting}
                                            className="rounded-xl p-2.5 text-slate-500 border border-transparent hover:text-rose-400 hover:bg-rose-500/10 hover:border-rose-500/20 shrink-0 self-center cursor-pointer transition-colors"
                                        >
                                            <Trash2 className="h-5 w-5" />
                                        </button>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Launch Form Button */}
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-gradient-to-r from-brand-indigo to-brand-cyan text-base font-bold text-white shadow-lg shadow-brand-indigo/25 hover:shadow-brand-indigo/40 transition-all cursor-pointer disabled:opacity-50"
                    >
                        {isSubmitting ? (
                            <>
                                <RefreshCw className="h-5 w-5 animate-spin" /> Preparing Smart Contracts...
                            </>
                        ) : (
                            <>
                                Launch Campaign & Deploy Escrow <ChevronRight className="h-5 w-5" />
                            </>
                        )}
                    </button>
                </form>
            )}
        </div>
    );
};
