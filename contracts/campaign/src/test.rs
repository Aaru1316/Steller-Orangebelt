#![cfg(test)]

use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    token, Address, Env, String, Vec,
};

#[test]
fn test_campaign_flow() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup ledger time
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1000,
        protocol_version: 21,
        sequence_number: 1,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 100,
        min_persistent_entry_ttl: 100,
        max_entry_ttl: 10000,
    });

    let creator = Address::generate(&env);
    let backer1 = Address::generate(&env);
    let backer2 = Address::generate(&env);

    // Deploy mock token
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);
    let token_client = token::Client::new(&env, &token_addr);

    // Mint tokens to backers
    token_admin_client.mint(&backer1, &1000);
    token_admin_client.mint(&backer2, &1000);

    assert_eq!(token_client.balance(&backer1), 1000);
    assert_eq!(token_client.balance(&backer2), 1000);

    // Deploy Campaign Contract
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign_client = CampaignContractClient::new(&env, &campaign_id);

    // Deploy Escrow Contract using the imported WASM
    let escrow_id = env.register_contract_wasm(None, escrow_contract::WASM);

    // Set up milestones input (funding goal = 1000)
    let mut milestones_input = Vec::new(&env);
    milestones_input.push_back(MilestoneInput {
        description: String::from_str(&env, "Milestone 1: Design"),
        amount: 400,
    });
    milestones_input.push_back(MilestoneInput {
        description: String::from_str(&env, "Milestone 2: Development"),
        amount: 600,
    });

    // Create Campaign
    let campaign_id_num = campaign_client.create_campaign(
        &creator,
        &escrow_id,
        &token_addr,
        &String::from_str(&env, "Campaign Title"),
        &String::from_str(&env, "Campaign Description"),
        &1000i128,
        &2000u64, // deadline
        &milestones_input,
    );

    assert_eq!(campaign_id_num, 1);
    assert_eq!(campaign_client.get_campaign_count(), 1);

    // Retrieve campaign details and verify
    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.creator, creator);
    assert_eq!(campaign.funding_goal, 1000);
    assert_eq!(campaign.total_pledged, 0);
    assert_eq!(campaign.current_milestone, 0);
    assert_eq!(campaign.completed, false);
    assert_eq!(campaign.milestones.len(), 2);

    // Pledge from Backer 1 (400 XLM)
    campaign_client.pledge(&1, &backer1, &400);
    assert_eq!(campaign_client.get_backer_pledge(&1, &backer1), 400);

    // Verify token was transferred to Escrow
    assert_eq!(token_client.balance(&backer1), 600);
    assert_eq!(token_client.balance(&escrow_id), 400);

    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.total_pledged, 400);

    // Pledge from Backer 2 (600 XLM)
    campaign_client.pledge(&1, &backer2, &600);
    assert_eq!(campaign_client.get_backer_pledge(&1, &backer2), 600);
    assert_eq!(token_client.balance(&backer2), 400);
    assert_eq!(token_client.balance(&escrow_id), 1000);

    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.total_pledged, 1000);

    // Fast forward ledger time past deadline to allow voting
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 2500,
        protocol_version: 21,
        sequence_number: 2,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 100,
        min_persistent_entry_ttl: 100,
        max_entry_ttl: 10000,
    });

    // Backer 1 votes YES on Milestone 1 (weight = 400).
    // Threshold is total_pledged/2 = 500. Vote count is 400. Not yet approved.
    campaign_client.vote_milestone(&1, &backer1, &true);
    assert!(campaign_client.has_voted(&1, &0, &backer1));

    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.current_milestone, 0); // still 0
    assert_eq!(token_client.balance(&creator), 0); // funds not released yet

    // Backer 2 votes YES on Milestone 1 (weight = 600).
    // Vote count = 1000 > 500. Milestone 1 should approve and release 400 to creator!
    campaign_client.vote_milestone(&1, &backer2, &true);
    assert!(campaign_client.has_voted(&1, &0, &backer2));

    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.current_milestone, 1); // incremented to 1
    assert_eq!(token_client.balance(&creator), 400); // creator received 400 XLM
    assert_eq!(token_client.balance(&escrow_id), 600); // 600 left in escrow

    // Backer 2 votes YES on Milestone 2 (weight = 600).
    // Threshold is 500. Vote count is 600 > 500. Milestone 2 should approve and release 600 to creator!
    campaign_client.vote_milestone(&1, &backer2, &true);

    let campaign = campaign_client.get_campaign(&1);
    assert_eq!(campaign.current_milestone, 2);
    assert_eq!(campaign.completed, true);
    assert_eq!(token_client.balance(&creator), 1000); // creator received all 1000 XLM
    assert_eq!(token_client.balance(&escrow_id), 0); // escrow empty
}

#[test]
fn test_campaign_refund() {
    let env = Env::default();
    env.mock_all_auths();

    // Setup ledger time
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 1000,
        protocol_version: 21,
        sequence_number: 1,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 100,
        min_persistent_entry_ttl: 100,
        max_entry_ttl: 10000,
    });

    let creator = Address::generate(&env);
    let backer = Address::generate(&env);

    // Deploy mock token
    let token_admin = Address::generate(&env);
    let token_contract = env.register_stellar_asset_contract_v2(token_admin.clone());
    let token_addr = token_contract.address();
    let token_admin_client = token::StellarAssetClient::new(&env, &token_addr);
    let token_client = token::Client::new(&env, &token_addr);

    token_admin_client.mint(&backer, &1000);

    // Deploy Campaign Contract
    let campaign_id = env.register_contract(None, CampaignContract);
    let campaign_client = CampaignContractClient::new(&env, &campaign_id);

    // Deploy Escrow Contract
    let escrow_id = env.register_contract_wasm(None, escrow_contract::WASM);

    // Set up milestones input (funding goal = 1000)
    let mut milestones_input = Vec::new(&env);
    milestones_input.push_back(MilestoneInput {
        description: String::from_str(&env, "M1"),
        amount: 1000,
    });

    // Create Campaign
    campaign_client.create_campaign(
        &creator,
        &escrow_id,
        &token_addr,
        &String::from_str(&env, "Campaign Title"),
        &String::from_str(&env, "Campaign Description"),
        &1000i128,
        &2000u64, // deadline
        &milestones_input,
    );

    // Pledge only 400 (funding goal is 1000)
    campaign_client.pledge(&1, &backer, &400);
    assert_eq!(token_client.balance(&backer), 600);
    assert_eq!(token_client.balance(&escrow_id), 400);

    // Fast forward past deadline
    env.ledger().set(soroban_sdk::testutils::LedgerInfo {
        timestamp: 2500,
        protocol_version: 21,
        sequence_number: 2,
        network_id: [0; 32],
        base_reserve: 10,
        min_temp_entry_ttl: 100,
        min_persistent_entry_ttl: 100,
        max_entry_ttl: 10000,
    });

    // Backer requests refund
    campaign_client.refund(&1, &backer);

    // Verify refund issued
    assert_eq!(token_client.balance(&backer), 1000); // backer has 1000 again
    assert_eq!(token_client.balance(&escrow_id), 0); // escrow is empty
    assert_eq!(campaign_client.get_backer_pledge(&1, &backer), 0);
}
