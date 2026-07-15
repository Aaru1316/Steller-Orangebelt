import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { isConnected, requestAccess, signTransaction } from '@stellar/freighter-api';

interface WalletContextType {
    address: string | null;
    isConnecting: boolean;
    error: string | null;
    isFreighterInstalled: boolean;
    connect: () => Promise<string | null>;
    disconnect: () => void;
    signTx: (xdr: string, networkPassphrase: string) => Promise<string>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [address, setAddress] = useState<string | null>(null);
    const [isConnecting, setIsConnecting] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);
    const [isFreighterInstalled, setIsFreighterInstalled] = useState<boolean>(false);

    useEffect(() => {
        const checkFreighter = async () => {
            try {
                const res = await isConnected();
                const installed = !!res && res.isConnected;
                setIsFreighterInstalled(installed);

                // Auto-connect if already authorized
                if (installed) {
                    const savedAddress = localStorage.getItem('wallet_address');
                    if (savedAddress) {
                        setAddress(savedAddress);
                    }
                }
            } catch (err) {
                console.error('Error checking Freighter status:', err);
            }
        };

        checkFreighter();
    }, []);

    const connect = async (): Promise<string | null> => {
        setIsConnecting(true);
        setError(null);
        try {
            const res = await isConnected();
            if (!res || !res.isConnected) {
                const errMsg = 'Freighter Wallet extension is not installed.';
                setError(errMsg);
                setIsConnecting(false);
                return null;
            }

            const response = await requestAccess();
            if (response.error) {
                throw new Error(response.error);
            }

            const walletAddress = response.address;

            if (!walletAddress) {
                throw new Error('User did not authorize wallet connection.');
            }

            setAddress(walletAddress);
            localStorage.setItem('wallet_address', walletAddress);
            setIsConnecting(false);
            return walletAddress;
        } catch (err: any) {
            console.error('Freighter connection error:', err);
            const errMsg = err.message || 'Failed to connect Freighter Wallet.';
            setError(errMsg);
            setIsConnecting(false);
            return null;
        }
    };

    const disconnect = () => {
        setAddress(null);
        localStorage.removeItem('wallet_address');
        setError(null);
    };

    const signTx = async (xdr: string, networkPassphrase: string): Promise<string> => {
        setError(null);
        try {
            const signedResult = await signTransaction(xdr, {
                networkPassphrase
            });
            let signedXdr: string;
            if (typeof signedResult === 'string') {
                signedXdr = signedResult;
            } else if (signedResult && typeof signedResult === 'object' && 'signedTxXdr' in signedResult) {
                signedXdr = (signedResult as { signedTxXdr: string }).signedTxXdr;
            } else {
                throw new Error('Invalid signature result format');
            }
            return signedXdr;
        } catch (err: any) {
            console.error('Freighter transaction signing error:', err);
            const errMsg = err.message || 'Transaction signing rejected or failed.';
            setError(errMsg);
            throw new Error(errMsg);
        }
    };

    return (
        <WalletContext.Provider
            value={{
                address,
                isConnecting,
                error,
                isFreighterInstalled,
                connect,
                disconnect,
                signTx
            }}
        >
            {children}
        </WalletContext.Provider>
    );
};

export const useWallet = (): WalletContextType => {
    const context = useContext(WalletContext);
    if (context === undefined) {
        throw new Error('useWallet must be used within a WalletProvider');
    }
    return context;
};
