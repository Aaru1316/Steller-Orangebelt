const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.join(__dirname, '..');
const CONTRACTS_DIR = path.join(PROJECT_ROOT, 'contracts');
const FRONTEND_SRC_DIR = path.join(PROJECT_ROOT, 'frontend', 'src');

function runCommand(command, cwd = PROJECT_ROOT, env = {}) {
    console.log(`Running: ${command}`);
    try {
        return execSync(command, {
            cwd,
            encoding: 'utf8',
            env: { ...process.env, ...env },
            stdio: ['pipe', 'pipe', 'inherit'] // inherit stderr so we see compilation output
        }).trim();
    } catch (error) {
        console.error(`Command failed: ${command}`);
        console.error(error.stdout || error.message);
        throw error;
    }
}

async function main() {
    console.log('--- starting deployment to Stellar Testnet ---');

    // 1. Configure custom target directory to avoid Windows file locks
    const targetBuildDir = path.join(CONTRACTS_DIR, 'target_build');
    const cargoEnv = { CARGO_TARGET_DIR: targetBuildDir };

    // 2. Build smart contracts
    console.log('Building contracts to wasm32v1-none...');
    runCommand('cargo build --target wasm32v1-none --release -j 1', CONTRACTS_DIR, cargoEnv);

    // 3. Fund / Generate deployer key on Testnet
    console.log('Funding/initializing deployer account on Stellar Testnet...');
    try {
        runCommand('stellar keys fund --network testnet deployer');
    } catch (error) {
        console.log('Identity "deployer" not found or needs funding. Generating and funding...');
        runCommand('stellar keys generate --fund --network testnet deployer');
    }

    // Get deployer public key
    const deployerAddress = runCommand('stellar keys address deployer');
    console.log(`Deployer address: ${deployerAddress}`);

    // 4. Deploy Escrow Contract
    console.log('Deploying Escrow contract...');
    const escrowWasmPath = path.join(targetBuildDir, 'wasm32v1-none', 'release', 'escrow.wasm');
    const escrowContractId = runCommand(`stellar contract deploy --wasm "${escrowWasmPath}" --source deployer --network testnet`);
    console.log(`Escrow Contract ID: ${escrowContractId}`);

    // 5. Deploy Campaign Contract
    console.log('Deploying Campaign contract...');
    const campaignWasmPath = path.join(targetBuildDir, 'wasm32v1-none', 'release', 'campaign.wasm');
    const campaignContractId = runCommand(`stellar contract deploy --wasm "${campaignWasmPath}" --source deployer --network testnet`);
    console.log(`Campaign Contract ID: ${campaignContractId}`);

    // Compute Escrow WASM hash
    const crypto = require('crypto');
    const escrowWasmBuffer = fs.readFileSync(escrowWasmPath);
    const escrowWasmHash = crypto.createHash('sha256').update(escrowWasmBuffer).digest('hex');
    console.log(`Escrow WASM Hash: ${escrowWasmHash}`);

    // 6. Save contract addresses
    const deploymentInfo = {
        network: 'testnet',
        deployer: deployerAddress,
        escrowContractId,
        campaignContractId,
        escrowWasmHash,
        timestamp: new Date().toISOString()
    };

    const configContent = JSON.stringify(deploymentInfo, null, 2);

    // Ensure directories exist
    if (!fs.existsSync(FRONTEND_SRC_DIR)) {
        fs.mkdirSync(FRONTEND_SRC_DIR, { recursive: true });
    }
    const scriptsConfigPath = path.join(__dirname, 'deployed_addresses.json');
    const frontendConfigPath = path.join(FRONTEND_SRC_DIR, 'contracts.json');

    fs.writeFileSync(scriptsConfigPath, configContent);
    fs.writeFileSync(frontendConfigPath, configContent);

    console.log(`Saved deployment info to: ${scriptsConfigPath}`);
    console.log(`Saved deployment info to: ${frontendConfigPath}`);

    console.log('--- deployment completed successfully ---');
}

main().catch(err => {
    console.error('Fatal error in deploy script:', err);
    process.exit(1);
});
