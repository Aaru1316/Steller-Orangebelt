#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, token, Address, Env, Symbol};

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    Campaign,
    Token,
    Balance(Address),
    TotalBalance,
    Initialized,
}

#[contract]
pub struct EscrowContract;

#[contractimpl]
impl EscrowContract {
    /// Initialize the Escrow contract with the Campaign contract and the Token contract address.
    pub fn initialize(env: Env, campaign: Address, token: Address) {
        if env.storage().instance().has(&DataKey::Initialized) {
            panic!("Escrow already initialized");
        }
        env.storage().instance().set(&DataKey::Campaign, &campaign);
        env.storage().instance().set(&DataKey::Token, &token);
        env.storage().instance().set(&DataKey::TotalBalance, &0i128);
        env.storage().instance().set(&DataKey::Initialized, &true);
    }

    /// Deposits funds from backer into this Escrow contract.
    /// Only callable by the associated Campaign contract.
    pub fn deposit(env: Env, backer: Address, amount: i128) {
        let campaign = env.storage().instance().get::<_, Address>(&DataKey::Campaign)
            .expect("Escrow not initialized");
        
        // Ensure only the campaign contract is calling deposit
        campaign.require_auth();

        if amount <= 0 {
            panic!("Deposit amount must be positive");
        }

        let token_addr = env.storage().instance().get::<_, Address>(&DataKey::Token)
            .expect("Escrow not initialized");
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer funds from the backer to the Escrow contract
        token_client.transfer(&backer, &env.current_contract_address(), &amount);

        // Update tracking balances
        let balance_key = DataKey::Balance(backer.clone());
        let current_balance = env.storage().instance().get::<_, i128>(&balance_key).unwrap_or(0);
        env.storage().instance().set(&balance_key, &(current_balance + amount));

        let total_balance = env.storage().instance().get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalBalance, &(total_balance + amount));

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "escrow_deposit"), backer),
            amount
        );
    }

    /// Releases a specified amount of funds to the recipient.
    /// Only callable by the associated Campaign contract.
    pub fn release(env: Env, recipient: Address, amount: i128) {
        let campaign = env.storage().instance().get::<_, Address>(&DataKey::Campaign)
            .expect("Escrow not initialized");
        
        // Ensure only the campaign contract is calling release
        campaign.require_auth();

        let total_balance = env.storage().instance().get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);
        if amount > total_balance {
            panic!("Insufficient escrow balance for release");
        }

        let token_addr = env.storage().instance().get::<_, Address>(&DataKey::Token)
            .expect("Escrow not initialized");
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer funds to the recipient
        token_client.transfer(&env.current_contract_address(), &recipient, &amount);

        // Update total balance
        env.storage().instance().set(&DataKey::TotalBalance, &(total_balance - amount));

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "escrow_release"), recipient),
            amount
        );
    }

    /// Refunds a backer their total pledged balance.
    /// Only callable by the Campaign contract.
    pub fn refund(env: Env, backer: Address, amount: i128) {
        let campaign = env.storage().instance().get::<_, Address>(&DataKey::Campaign)
            .expect("Escrow not initialized");
        
        // Ensure only campaign can call refund
        campaign.require_auth();

        let balance_key = DataKey::Balance(backer.clone());
        let backer_balance = env.storage().instance().get::<_, i128>(&balance_key).unwrap_or(0);
        if backer_balance < amount {
            panic!("Insufficient balance to refund requested amount");
        }

        let token_addr = env.storage().instance().get::<_, Address>(&DataKey::Token)
            .expect("Escrow not initialized");
        let token_client = token::Client::new(&env, &token_addr);

        // Transfer funds back to backer
        token_client.transfer(&env.current_contract_address(), &backer, &amount);

        // Update balances
        env.storage().instance().set(&balance_key, &(backer_balance - amount));

        let total_balance = env.storage().instance().get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0);
        env.storage().instance().set(&DataKey::TotalBalance, &(total_balance - amount));

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "escrow_refund"), backer),
            amount
        );
    }

    /// Read function to check current total balance.
    pub fn get_balance(env: Env) -> i128 {
        env.storage().instance().get::<_, i128>(&DataKey::TotalBalance).unwrap_or(0)
    }

    /// Read function to check balance of a specific backer.
    pub fn get_backer_balance(env: Env, backer: Address) -> i128 {
        env.storage().instance().get::<_, i128>(&DataKey::Balance(backer)).unwrap_or(0)
    }
}
