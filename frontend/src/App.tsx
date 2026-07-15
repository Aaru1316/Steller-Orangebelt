import { useState } from 'react';
import { WalletProvider } from './context/WalletContext';
import { Navbar } from './components/Navbar';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { CreateCampaign } from './pages/CreateCampaign';
import { CampaignDetails } from './pages/CampaignDetails';

function AppContent() {
    const [currentPage, setCurrentPage] = useState<string>('home');
    const [selectedCampaignId, setSelectedCampaignId] = useState<number | null>(null);

    const onViewCampaign = (id: number) => {
        setSelectedCampaignId(id);
        setCurrentPage('details');
    };

    const renderPage = () => {
        switch (currentPage) {
            case 'home':
                return <Home onViewCampaign={onViewCampaign} setCurrentPage={setCurrentPage} />;
            case 'dashboard':
                return <Dashboard onViewCampaign={onViewCampaign} />;
            case 'create':
                return <CreateCampaign setCurrentPage={setCurrentPage} />;
            case 'details':
                return selectedCampaignId !== null ? (
                    <CampaignDetails 
                        campaignId={selectedCampaignId} 
                        onBack={() => {
                            setSelectedCampaignId(null);
                            setCurrentPage('home');
                        }} 
                    />
                ) : (
                    <Home onViewCampaign={onViewCampaign} setCurrentPage={setCurrentPage} />
                );
            default:
                return <Home onViewCampaign={onViewCampaign} setCurrentPage={setCurrentPage} />;
        }
    };

    return (
        <div className="min-h-screen bg-bg-deep flex flex-col text-slate-100">
            <Navbar 
                currentPage={currentPage} 
                setCurrentPage={(page) => {
                    setCurrentPage(page);
                    setSelectedCampaignId(null);
                }} 
            />
            <main className="flex-1">
                {renderPage()}
            </main>
            
            {/* Footer */}
            <footer className="border-t border-white/5 py-8 mt-16 bg-slate-950/20 backdrop-blur text-center text-xs text-slate-500">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <span>
                        &copy; 2026 MilestoneFund Platform. Built on Stellar Soroban with Rust.
                    </span>
                    <div className="flex gap-6 text-slate-400 font-semibold">
                        <a href="#" className="hover:text-brand-cyan transition-colors">Privacy Policy</a>
                        <a href="#" className="hover:text-brand-cyan transition-colors">Terms of Service</a>
                        <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="hover:text-brand-cyan transition-colors">GitHub</a>
                    </div>
                </div>
            </footer>
        </div>
    );
}

function App() {
    return (
        <WalletProvider>
            <AppContent />
        </WalletProvider>
    );
}

export default App;
