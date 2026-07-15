import React, { useState } from 'react';
import { useWallet } from '../context/WalletContext';
import { Menu, X, Landmark, Wallet, LogOut } from 'lucide-react';

interface NavbarProps {
    currentPage: string;
    setCurrentPage: (page: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({ currentPage, setCurrentPage }) => {
    const { address, isConnecting, connect, disconnect } = useWallet();
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const handleConnect = async () => {
        await connect();
    };

    const navItems = [
        { id: 'home', label: 'Home' },
        { id: 'dashboard', label: 'Dashboard' },
        { id: 'create', label: 'Create Campaign' }
    ];

    const formatAddress = (addr: string) => {
        return `${addr.substring(0, 5)}...${addr.substring(addr.length - 4)}`;
    };

    return (
        <nav className="sticky top-0 z-50 w-full glass-effect border-b border-white/10 backdrop-blur-md">
            <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <div className="flex h-16 items-center justify-between">
                    {/* Logo & Brand */}
                    <div className="flex items-center gap-2 cursor-pointer" onClick={() => setCurrentPage('home')}>
                        <div className="rounded-xl bg-gradient-to-tr from-brand-indigo to-brand-cyan p-2.5 shadow-md glow-cyan">
                            <Landmark className="h-6 w-6 text-white" />
                        </div>
                        <span className="font-display text-xl font-bold tracking-tight text-white">
                            Milestone<span className="bg-gradient-to-r from-brand-indigo to-brand-cyan bg-clip-text text-transparent">Fund</span>
                        </span>
                    </div>

                    {/* Desktop Navigation */}
                    <div className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-1.5">
                            {navItems.map((item) => (
                                <button
                                    key={item.id}
                                    onClick={() => setCurrentPage(item.id)}
                                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
                                        currentPage === item.id
                                            ? 'bg-brand-indigo/15 text-brand-cyan border border-brand-indigo/35 shadow-[0_0_15px_-3px_rgba(99,102,241,0.2)]'
                                            : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                                    }`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>

                        {/* Wallet Integration Button */}
                        <div className="flex items-center gap-3">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-800/80 px-3 py-1 text-xs font-semibold text-brand-cyan border border-slate-700/50">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                                Testnet
                            </span>

                            {address ? (
                                <div className="flex items-center gap-2 rounded-xl bg-slate-900 border border-white/10 px-4 py-2">
                                    <div className="flex flex-col text-right">
                                        <span className="text-xs text-slate-500 font-medium">Connected</span>
                                        <span className="font-mono text-sm text-slate-200 font-semibold">{formatAddress(address)}</span>
                                    </div>
                                    <button
                                        onClick={disconnect}
                                        className="ml-2 rounded-lg p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                        title="Disconnect Wallet"
                                    >
                                        <LogOut className="h-4.5 w-4.5" />
                                    </button>
                                </div>
                            ) : (
                                <button
                                    onClick={handleConnect}
                                    disabled={isConnecting}
                                    className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-indigo to-brand-cyan px-5 py-2.5 text-sm font-semibold text-white hover:opacity-95 transition-all shadow-lg shadow-brand-indigo/25 hover:shadow-brand-indigo/40 disabled:opacity-50"
                                >
                                    <Wallet className="h-4 w-4" />
                                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Mobile Menu Button */}
                    <div className="md:hidden flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-brand-cyan border border-slate-700">
                            Testnet
                        </span>
                        <button
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white"
                        >
                            {isMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                        </button>
                    </div>
                </div>
            </div>

            {/* Mobile Menu */}
            {isMenuOpen && (
                <div className="md:hidden glass-effect border-b border-white/10 px-4 py-4 space-y-3">
                    <div className="space-y-1">
                        {navItems.map((item) => (
                            <button
                                key={item.id}
                                onClick={() => {
                                    setCurrentPage(item.id);
                                    setIsMenuOpen(false);
                                }}
                                className={`w-full text-left px-4 py-2.5 rounded-lg text-base font-medium transition-all ${
                                    currentPage === item.id
                                        ? 'bg-brand-indigo/15 text-brand-cyan'
                                        : 'text-slate-400 hover:text-white hover:bg-white/5'
                                }`}
                            >
                                {item.label}
                            </button>
                        ))}
                    </div>

                    <div className="pt-3 border-t border-white/5">
                        {address ? (
                            <div className="flex items-center justify-between rounded-xl bg-slate-900 border border-white/10 px-4 py-3">
                                <div className="flex flex-col">
                                    <span className="text-xs text-slate-500 font-medium">Connected Address</span>
                                    <span className="font-mono text-sm text-slate-200 font-semibold">{formatAddress(address)}</span>
                                </div>
                                <button
                                    onClick={() => {
                                        disconnect();
                                        setIsMenuOpen(false);
                                    }}
                                    className="rounded-lg bg-rose-500/10 p-2 text-rose-400 hover:bg-rose-500/20"
                                >
                                    <LogOut className="h-5 w-5" />
                                </button>
                            </div>
                        ) : (
                            <button
                                onClick={() => {
                                    handleConnect();
                                    setIsMenuOpen(false);
                                }}
                                disabled={isConnecting}
                                className="w-full flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-brand-indigo to-brand-cyan py-3 text-base font-semibold text-white shadow-md shadow-brand-indigo/20 disabled:opacity-50"
                            >
                                <Wallet className="h-5 w-5" />
                                {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                            </button>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
};
