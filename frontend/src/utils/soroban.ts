import {
    Contract,
    rpc,
    xdr,
    TransactionBuilder,
    TimeoutInfinite,
    scValToNative,
    nativeToScVal,
    Address,
    Operation,
    Account
} from '@stellar/stellar-sdk';
import contractsConfig from '../contracts.json';

const RPC_URL = 'https://soroban-testnet.stellar.org';
const NETWORK_PASSPHRASE = 'Test SDF Network ; September 2015';

export const rpcServer = new rpc.Server(RPC_URL);
export const campaignContractId = contractsConfig.campaignContractId;
export const escrowContractId = contractsConfig.escrowContractId;

const campaignContract = new Contract(campaignContractId);

/**
 * Helper to simulate a read-only contract call.
 */
async function simulateCall(method: string, args: xdr.ScVal[] = []): Promise<any> {
    // Generate a temporary dummy account for simulation
    const dummyAccount = new Account('GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF', '0');
    const tx = new TransactionBuilder(dummyAccount, {
        fee: '100',
        networkPassphrase: NETWORK_PASSPHRASE
    })
    .addOperation(campaignContract.call(method, ...args))
    .setTimeout(TimeoutInfinite)
    .build();

    const result = await rpcServer.simulateTransaction(tx);
    
    if (rpc.Api.isSimulationSuccess(result)) {
        if (result.result && result.result.retval) {
            return scValToNative(result.result.retval);
        }
        return null;
    } else {
        console.error(`Simulation failed for ${method}:`, result);
        throw new Error(`Simulation failed for contract method ${method}`);
    }
}

export interface Milestone {
    description: string;
    amount: bigint;
    approved: boolean;
    votes_for: bigint;
    votes_against: bigint;
}

export interface CampaignInfo {
    id: number;
    creator: string;
    escrow: string;
    token: string;
    title: string;
    description: string;
    funding_goal: bigint;
    total_pledged: bigint;
    deadline: bigint;
    milestones: Milestone[];
    current_milestone: number;
    completed: boolean;
}

// Convert string/Uint8Array or buffer to string
function parseScString(val: any): string {
    if (typeof val === 'string') return val;
    if (val instanceof Uint8Array) {
        return new TextDecoder().decode(val);
    }
    if (val && typeof val === 'object' && 'toString' in val) {
        return val.toString();
    }
    return '';
}

/**
 * Fetch the total number of campaigns.
 */
export async function getCampaignCount(): Promise<number> {
    try {
        const count = await simulateCall('get_campaign_count');
        return Number(count || 0);
    } catch (err) {
        console.error('Error fetching campaign count:', err);
        return 0;
    }
}

/**
 * Fetch details of a campaign.
 */
export async function getCampaign(campaignId: number): Promise<CampaignInfo | null> {
    try {
        const rawCampaign = await simulateCall('get_campaign', [
            nativeToScVal(campaignId, { type: 'u32' })
        ]);
        
        if (!rawCampaign) return null;

        const milestones = (rawCampaign.milestones || []).map((m: any) => ({
            description: parseScString(m.description),
            amount: BigInt(m.amount),
            approved: !!m.approved,
            votes_for: BigInt(m.votes_for || 0),
            votes_against: BigInt(m.votes_against || 0)
        }));

        return {
            id: Number(rawCampaign.id),
            creator: rawCampaign.creator.toString(),
            escrow: rawCampaign.escrow.toString(),
            token: rawCampaign.token.toString(),
            title: parseScString(rawCampaign.title),
            description: parseScString(rawCampaign.description),
            funding_goal: BigInt(rawCampaign.funding_goal),
            total_pledged: BigInt(rawCampaign.total_pledged),
            deadline: BigInt(rawCampaign.deadline),
            milestones,
            current_milestone: Number(rawCampaign.current_milestone),
            completed: !!rawCampaign.completed
        };
    } catch (err) {
        console.error(`Error fetching campaign ${campaignId}:`, err);
        return null;
    }
}

/**
 * Get backer's pledge for a campaign.
 */
export async function getBackerPledge(campaignId: number, backerAddress: string): Promise<bigint> {
    try {
        const amount = await simulateCall('get_backer_pledge', [
            nativeToScVal(campaignId, { type: 'u32' }),
            Address.fromString(backerAddress).toScVal()
        ]);
        return amount ? BigInt(amount) : 0n;
    } catch (err) {
        console.error('Error fetching backer pledge:', err);
        return 0n;
    }
}

/**
 * Check if a backer has voted on the current milestone.
 */
export async function hasVoted(campaignId: number, milestoneIndex: number, backerAddress: string): Promise<boolean> {
    try {
        const voted = await simulateCall('has_voted', [
            nativeToScVal(campaignId, { type: 'u32' }),
            nativeToScVal(milestoneIndex, { type: 'u32' }),
            Address.fromString(backerAddress).toScVal()
        ]);
        return !!voted;
    } catch (err) {
        console.error('Error checking vote status:', err);
        return false;
    }
}

/**
 * Execute a transaction on the ledger (prepare, sign, submit, poll).
 */
async function executeTransaction(
    userAddress: string,
    operation: xdr.Operation,
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    // 1. Fetch account sequence number
    const sourceAccount = await rpcServer.getAccount(userAddress);
    
    // 2. Build base transaction
    let tx = new TransactionBuilder(sourceAccount, {
        fee: '100000', // fallback base fee
        networkPassphrase: NETWORK_PASSPHRASE
    })
    .addOperation(operation)
    .setTimeout(TimeoutInfinite)
    .build();

    // 3. Prepare transaction (calculates footprints, gas, fees)
    tx = await rpcServer.prepareTransaction(tx);

    // 4. Request Freighter signature
    const signedXdr = await signTx(tx.toXDR(), NETWORK_PASSPHRASE);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    // 5. Submit transaction
    const sendResponse = await rpcServer.sendTransaction(signedTx);
    
    if (sendResponse.status === 'ERROR') {
        throw new Error(`Transaction submission failed: ${JSON.stringify(sendResponse.errorResult)}`);
    }

    const txHash = sendResponse.hash;
    console.log(`Transaction submitted. Hash: ${txHash}. Polling status...`);

    // 6. Poll for transaction confirmation
    let status: string = sendResponse.status;
    let attempts = 0;
    while (status !== 'SUCCESS' && status !== 'FAILED' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const txResponse = await rpcServer.getTransaction(txHash);
        status = txResponse.status as any;
        
        if (status === 'SUCCESS') {
            return txHash;
        } else if (status === 'FAILED') {
            throw new Error(`Transaction failed execution: ${JSON.stringify((txResponse as any).resultXdr || '')}`);
        }
        attempts++;
    }

    if (status !== 'SUCCESS') {
        throw new Error('Transaction execution timed out.');
    }
    
    return txHash;
}

/**
 * Deploy a new Escrow contract instance from the pre-uploaded WASM hash.
 * Returns the newly created Escrow Contract Address (ID).
 */
export async function deployEscrowContract(
    userAddress: string,
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    const wasmHashBytes = new Uint8Array(
        contractsConfig.escrowWasmHash.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16))
    );
    const salt = window.crypto.getRandomValues(new Uint8Array(32));
    
    // Build the create contract operation
    const operation = Operation.createCustomContract({
        address: Address.fromString(userAddress),
        wasmHash: wasmHashBytes,
        salt
    });

    // 1. Fetch account sequence number for simulation and prep
    const sourceAccount = await rpcServer.getAccount(userAddress);
    
    let tx = new TransactionBuilder(sourceAccount, {
        fee: '100000',
        networkPassphrase: NETWORK_PASSPHRASE
    })
    .addOperation(operation)
    .setTimeout(TimeoutInfinite)
    .build();

    // 2. Simulate transaction to find return value (which is the contract ID)
    const result = await rpcServer.simulateTransaction(tx);
    if (!rpc.Api.isSimulationSuccess(result) || !result.result || !result.result.retval) {
        throw new Error('Simulation of Escrow deployment failed');
    }

    const deployedAddress = scValToNative(result.result.retval);
    const escrowContractId = deployedAddress.toString();
    console.log(`Simulated Escrow deployment. Resulting Address: ${escrowContractId}`);

    // 3. Prepare, sign, and submit transaction to make it final
    tx = await rpcServer.prepareTransaction(tx);
    const signedXdr = await signTx(tx.toXDR(), NETWORK_PASSPHRASE);
    const signedTx = TransactionBuilder.fromXDR(signedXdr, NETWORK_PASSPHRASE);

    const sendResponse = await rpcServer.sendTransaction(signedTx);
    if (sendResponse.status === 'ERROR') {
        throw new Error(`Escrow deployment failed: ${JSON.stringify(sendResponse.errorResult)}`);
    }

    // Poll transaction status
    const txHash = sendResponse.hash;
    let status: string = sendResponse.status;
    let attempts = 0;
    while (status !== 'SUCCESS' && status !== 'FAILED' && attempts < 30) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const txResponse = await rpcServer.getTransaction(txHash);
        status = txResponse.status as any;
        if (status === 'SUCCESS') {
            return escrowContractId;
        } else if (status === 'FAILED') {
            throw new Error(`Escrow deployment execution failed: ${JSON.stringify((txResponse as any).resultXdr || '')}`);
        }
        attempts++;
    }

    throw new Error('Escrow deployment timed out');
}

/**
 * Create a new campaign transaction.
 */
export async function createCampaignTx(
    userAddress: string,
    escrowAddress: string,
    tokenAddress: string,
    title: string,
    description: string,
    fundingGoal: bigint,
    deadline: bigint,
    milestones: { description: string; amount: bigint }[],
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    const milestoneInputs = milestones.map(m => 
        xdr.ScVal.scvMap([
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol('amount'),
                val: nativeToScVal(m.amount, { type: 'i128' })
            }),
            new xdr.ScMapEntry({
                key: xdr.ScVal.scvSymbol('description'),
                val: nativeToScVal(m.description, { type: 'string' })
            })
        ])
    );

    const operation = campaignContract.call(
        'create_campaign',
        Address.fromString(userAddress).toScVal(),
        Address.fromString(escrowAddress).toScVal(),
        Address.fromString(tokenAddress).toScVal(),
        nativeToScVal(title, { type: 'string' }),
        nativeToScVal(description, { type: 'string' }),
        nativeToScVal(fundingGoal, { type: 'i128' }),
        nativeToScVal(deadline, { type: 'u64' }),
        xdr.ScVal.scvVec(milestoneInputs)
    );

    return executeTransaction(userAddress, operation, signTx);
}

/**
 * Pledge funds to a campaign.
 */
export async function pledgeTx(
    userAddress: string,
    campaignId: number,
    amount: bigint,
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    const operation = campaignContract.call(
        'pledge',
        nativeToScVal(campaignId, { type: 'u32' }),
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(amount, { type: 'i128' })
    );

    return executeTransaction(userAddress, operation, signTx);
}

/**
 * Vote on a milestone.
 */
export async function voteMilestoneTx(
    userAddress: string,
    campaignId: number,
    approve: boolean,
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    const operation = campaignContract.call(
        'vote_milestone',
        nativeToScVal(campaignId, { type: 'u32' }),
        Address.fromString(userAddress).toScVal(),
        xdr.ScVal.scvBool(approve)
    );

    return executeTransaction(userAddress, operation, signTx);
}

/**
 * Request a refund.
 */
export async function refundTx(
    userAddress: string,
    campaignId: number,
    signTx: (xdr: string, passphrase: string) => Promise<string>
): Promise<string> {
    const operation = campaignContract.call(
        'refund',
        nativeToScVal(campaignId, { type: 'u32' }),
        Address.fromString(userAddress).toScVal()
    );

    return executeTransaction(userAddress, operation, signTx);
}

export interface SorobanEvent {
    id: string;
    contractId: string;
    topic: string[];
    value: any;
    ledger: number;
    timestamp: string;
}

/**
 * Fetch recent contract events.
 */
export async function fetchEvents(startLedger: number = 0): Promise<{ events: SorobanEvent[]; latestLedger: number }> {
    try {
        const latestLedgerResponse = await rpcServer.getLatestLedger();
        const latestLedger = latestLedgerResponse.sequence;

        // Query events from either startLedger or last 1000 ledgers, clamped to last 10,000 ledgers to avoid out-of-range errors
        let start = startLedger > 0 ? startLedger : latestLedger - 1000;
        if (start < latestLedger - 10000) {
            start = latestLedger - 10000;
        }
        
        const response = await rpcServer.getEvents({
            startLedger: start,
            filters: [
                {
                    type: 'contract',
                    contractIds: [campaignContractId, escrowContractId]
                }
            ],
            limit: 50
        });

        const events = (response.events || []).map((e: any) => {
            let topicStrs: string[] = [];
            try {
                const topicsVal = e.topic.map((t: any) => xdr.ScVal.fromXDR(t, 'base64'));
                topicStrs = topicsVal.map((t: any) => {
                    const parsed = scValToNative(t);
                    return parsed ? parsed.toString() : '';
                });
            } catch (err) {
                console.error('Error parsing event topics:', err);
            }

            let parsedValue = null;
            try {
                const val = xdr.ScVal.fromXDR(e.value, 'base64');
                parsedValue = scValToNative(val);
            } catch (err) {
                console.error('Error parsing event value:', err);
            }

            return {
                id: e.id,
                contractId: e.contractId,
                topic: topicStrs,
                value: parsedValue,
                ledger: Number(e.ledger),
                timestamp: e.ledgerClosedAt || new Date().toISOString()
            };
        });

        return {
            events,
            latestLedger
        };
    } catch (err) {
        console.error('Error fetching events:', err);
        return { events: [], latestLedger: startLedger };
    }
}
