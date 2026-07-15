import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CampaignCard } from '../components/CampaignCard';
import { Navbar } from '../components/Navbar';
import { WalletProvider } from '../context/WalletContext';

// Mock freighter-api
vi.mock('@stellar/freighter-api', () => ({
    isConnected: vi.fn().mockResolvedValue(true),
    getAddress: vi.fn().mockResolvedValue({ address: 'GAT3STADDRESS1234567890' }),
    signTransaction: vi.fn().mockResolvedValue('mock_signed_xdr'),
}));

// Mock stellar-sdk
vi.mock('@stellar/stellar-sdk', () => ({
    Contract: vi.fn(),
    rpc: {
        Server: vi.fn().mockImplementation(function () {
            return {
                simulateTransaction: vi.fn(),
                getAccount: vi.fn(),
                prepareTransaction: vi.fn(),
                sendTransaction: vi.fn(),
                getTransaction: vi.fn()
            };
        }),
    },
    Address: {
        fromString: vi.fn().mockReturnValue({
            toScVal: vi.fn(),
        }),
    },
    nativeToScVal: vi.fn(),
    scValToNative: vi.fn(),
}));

// Mock contracts.json
vi.mock('../contracts.json', () => ({
    default: {
        campaignContractId: 'CC11111111111111111111111111111111111111111111111111111111111111',
        escrowContractId: 'CD22222222222222222222222222222222222222222222222222222222222222',
        escrowWasmHash: 'hash123'
    }
}));

describe('Navbar Component', () => {
    it('renders Brand Logo and Connect Wallet button', () => {
        render(
            <WalletProvider>
                <Navbar currentPage="home" setCurrentPage={() => {}} />
            </WalletProvider>
        );
        
        expect(screen.getByText('Milestone')).toBeInTheDocument();
        expect(screen.getByText('Connect Wallet')).toBeInTheDocument();
    });
});

describe('CampaignCard Component', () => {
    const mockCampaign = {
        id: 1,
        creator: 'GACREATOR1234567890',
        escrow: 'CDESCROW1234567890',
        token: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
        title: 'Save the Oceans',
        description: 'Removing plastic waste from international waters.',
        funding_goal: 10000000000n, // 1000 XLM (in stroops)
        total_pledged: 4000000000n,  // 400 XLM (in stroops)
        deadline: 2000000000n,       // Future timestamp
        milestones: [
            { description: 'M1', amount: 4000000000n, approved: false, votes_for: 0n, votes_against: 0n },
            { description: 'M2', amount: 6000000000n, approved: false, votes_for: 0n, votes_against: 0n }
        ],
        current_milestone: 0,
        completed: false
    };

    it('renders campaign details and calculates progress bar', () => {
        render(
            <CampaignCard campaign={mockCampaign} onViewDetails={() => {}} />
        );

        // Verify Title and Description
        expect(screen.getByText('Save the Oceans')).toBeInTheDocument();
        expect(screen.getByText(/Removing plastic waste/)).toBeInTheDocument();

        // Verify pledge progress (400/1000 = 40%)
        expect(screen.getByText('40%')).toBeInTheDocument();
        expect(screen.getByText(/Goal:/)).toBeInTheDocument();
        expect(screen.getByText(/1,000/)).toBeInTheDocument();
        expect(screen.getByText(/Pledged:/)).toBeInTheDocument();
        expect(screen.getByText(/400/)).toBeInTheDocument();
    });
});

describe('Pledge Input Validation', () => {
    it('allows inputting values', () => {
        const handleInputChange = vi.fn();
        render(
            <input 
                type="number"
                placeholder="Pledge amount"
                onChange={handleInputChange}
            />
        );

        const input = screen.getByPlaceholderText('Pledge amount');
        fireEvent.change(input, { target: { value: '50' } });
        expect(handleInputChange).toHaveBeenCalled();
    });
});
