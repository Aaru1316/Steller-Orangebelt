#![no_std]
use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

// Import Escrow Contract's generated client
mod escrow_contract {
    soroban_sdk::contractimport!(file = "../target_build/wasm32v1-none/release/escrow.wasm");
}
use escrow_contract::Client as EscrowClient;

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Milestone {
    pub description: String,
    pub amount: i128,
    pub approved: bool,
    pub votes_for: i128,
    pub votes_against: i128,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct Campaign {
    pub id: u32,
    pub creator: Address,
    pub escrow: Address,
    pub token: Address,
    pub title: String,
    pub description: String,
    pub funding_goal: i128,
    pub total_pledged: i128,
    pub deadline: u64,
    pub milestones: Vec<Milestone>,
    pub current_milestone: u32,
    pub completed: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
#[contracttype]
pub struct MilestoneInput {
    pub description: String,
    pub amount: i128,
}

#[derive(Clone)]
#[contracttype]
pub enum DataKey {
    CampaignCount,
    Campaign(u32),
    Pledge(u32, Address),
    Voted(u32, u32, Address), // (campaign_id, milestone_index, backer)
}

#[contract]
pub struct CampaignContract;

#[contractimpl]
impl CampaignContract {
    /// Create a new campaign.
    /// This will initialize the associated Escrow contract.
    pub fn create_campaign(
        env: Env,
        creator: Address,
        escrow: Address,
        token: Address,
        title: String,
        description: String,
        funding_goal: i128,
        deadline: u64,
        milestones_input: Vec<MilestoneInput>,
    ) -> u32 {
        creator.require_auth();

        if deadline <= env.ledger().timestamp() {
            panic!("Deadline must be in the future");
        }
        if funding_goal <= 0 {
            panic!("Funding goal must be greater than zero");
        }
        if milestones_input.is_empty() {
            panic!("Campaign must have at least one milestone");
        }

        // Sum up milestone amounts to verify they match the funding goal
        let mut total_milestone_amount: i128 = 0;
        let mut milestones = Vec::new(&env);

        for milestone_in in milestones_input.iter() {
            if milestone_in.amount <= 0 {
                panic!("Milestone amount must be greater than zero");
            }
            total_milestone_amount += milestone_in.amount;
            milestones.push_back(Milestone {
                description: milestone_in.description,
                amount: milestone_in.amount,
                approved: false,
                votes_for: 0,
                votes_against: 0,
            });
        }

        if total_milestone_amount != funding_goal {
            panic!("Sum of milestone amounts must equal the funding goal");
        }

        // Increment campaign counter
        let mut count: u32 = env
            .storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0);
        count += 1;
        env.storage()
            .instance()
            .set(&DataKey::CampaignCount, &count);

        // Initialize the Escrow contract via cross-contract call
        let escrow_client = EscrowClient::new(&env, &escrow);
        escrow_client.initialize(&env.current_contract_address(), &token);

        let campaign = Campaign {
            id: count,
            creator: creator.clone(),
            escrow: escrow.clone(),
            token,
            title: title.clone(),
            description,
            funding_goal,
            total_pledged: 0,
            deadline,
            milestones,
            current_milestone: 0,
            completed: false,
        };

        env.storage()
            .persistent()
            .set(&DataKey::Campaign(count), &campaign);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "campaign_created"), count, creator),
            title,
        );

        count
    }

    /// Pledge funds to a campaign.
    pub fn pledge(env: Env, campaign_id: u32, backer: Address, amount: i128) {
        backer.require_auth();

        let mut campaign = env
            .storage()
            .persistent()
            .get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .expect("Campaign not found");

        if env.ledger().timestamp() >= campaign.deadline {
            panic!("Campaign deadline has passed");
        }
        if campaign.completed {
            panic!("Campaign is already completed");
        }
        if amount <= 0 {
            panic!("Pledge amount must be positive");
        }

        // Perform cross-contract call to deposit funds to the Escrow contract
        let escrow_client = EscrowClient::new(&env, &campaign.escrow);
        escrow_client.deposit(&backer, &amount);

        // Record backer pledge
        let pledge_key = DataKey::Pledge(campaign_id, backer.clone());
        let current_pledge = env
            .storage()
            .persistent()
            .get::<_, i128>(&pledge_key)
            .unwrap_or(0);
        env.storage()
            .persistent()
            .set(&pledge_key, &(current_pledge + amount));

        // Update campaign pledged amount
        campaign.total_pledged += amount;
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);

        // Emit event
        env.events().publish(
            (Symbol::new(&env, "pledge_made"), campaign_id, backer),
            amount,
        );
    }

    /// Vote on the current milestone approval.
    /// Backers can vote. Vote weight is proportional to their pledge amount.
    pub fn vote_milestone(env: Env, campaign_id: u32, backer: Address, approve: bool) {
        backer.require_auth();

        let mut campaign = env
            .storage()
            .persistent()
            .get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .expect("Campaign not found");

        if campaign.completed {
            panic!("Campaign is already completed");
        }
        if campaign.total_pledged < campaign.funding_goal {
            panic!("Campaign is not successfully funded yet");
        }
        if env.ledger().timestamp() < campaign.deadline {
            panic!("Campaign must reach its deadline before voting begins");
        }

        let current_index = campaign.current_milestone;
        if current_index >= campaign.milestones.len() {
            panic!("All milestones are already approved");
        }

        // Check if backer has already voted on this milestone
        let voted_key = DataKey::Voted(campaign_id, current_index, backer.clone());
        if env.storage().persistent().has(&voted_key) {
            panic!("Backer has already voted on this milestone");
        }

        // Get backer pledge weight
        let pledge_key = DataKey::Pledge(campaign_id, backer.clone());
        let pledge_amount = env
            .storage()
            .persistent()
            .get::<_, i128>(&pledge_key)
            .unwrap_or(0);
        if pledge_amount <= 0 {
            panic!("Only backers can vote");
        }

        let mut milestone = campaign.milestones.get(current_index).unwrap();

        if approve {
            milestone.votes_for += pledge_amount;
        } else {
            milestone.votes_against += pledge_amount;
        }

        // Set voted to true
        env.storage().persistent().set(&voted_key, &true);

        // Check if approval threshold reached (votes_for > 50% of total pledge)
        let threshold = campaign.total_pledged / 2;
        if milestone.votes_for > threshold {
            milestone.approved = true;

            // Perform cross-contract call to release milestone funds to the campaign creator
            let escrow_client = EscrowClient::new(&env, &campaign.escrow);
            escrow_client.release(&campaign.creator, &milestone.amount);

            campaign.current_milestone += 1;

            if campaign.current_milestone >= campaign.milestones.len() {
                campaign.completed = true;
                env.events().publish(
                    (Symbol::new(&env, "campaign_completed"), campaign_id),
                    campaign.creator.clone(),
                );
            }

            // Emit milestone approved event
            env.events().publish(
                (
                    Symbol::new(&env, "milestone_approved"),
                    campaign_id,
                    current_index,
                ),
                milestone.amount,
            );
        }

        // Update the milestone in the campaign vector
        campaign.milestones.set(current_index, milestone);
        env.storage()
            .persistent()
            .set(&DataKey::Campaign(campaign_id), &campaign);
    }

    /// Backers can request a refund if the campaign did not meet the funding goal by the deadline.
    pub fn refund(env: Env, campaign_id: u32, backer: Address) {
        backer.require_auth();

        let campaign = env
            .storage()
            .persistent()
            .get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .expect("Campaign not found");

        if env.ledger().timestamp() < campaign.deadline {
            panic!("Campaign deadline has not passed yet");
        }
        if campaign.total_pledged >= campaign.funding_goal {
            panic!("Campaign was successfully funded; refunds are disabled");
        }

        let pledge_key = DataKey::Pledge(campaign_id, backer.clone());
        let pledge_amount = env
            .storage()
            .persistent()
            .get::<_, i128>(&pledge_key)
            .unwrap_or(0);
        if pledge_amount <= 0 {
            panic!("No pledge found to refund");
        }

        // Perform cross-contract call to refund the backer
        let escrow_client = EscrowClient::new(&env, &campaign.escrow);
        escrow_client.refund(&backer, &pledge_amount);

        // Reset backer pledge
        env.storage().persistent().set(&pledge_key, &0i128);

        // Emit refund event
        env.events().publish(
            (Symbol::new(&env, "refund_issued"), campaign_id, backer),
            pledge_amount,
        );
    }

    /// Read function to retrieve campaign info.
    pub fn get_campaign(env: Env, campaign_id: u32) -> Campaign {
        env.storage()
            .persistent()
            .get::<_, Campaign>(&DataKey::Campaign(campaign_id))
            .expect("Campaign not found")
    }

    /// Get total campaigns count.
    pub fn get_campaign_count(env: Env) -> u32 {
        env.storage()
            .instance()
            .get(&DataKey::CampaignCount)
            .unwrap_or(0)
    }

    /// Get the amount pledged by a specific backer to a campaign.
    pub fn get_backer_pledge(env: Env, campaign_id: u32, backer: Address) -> i128 {
        env.storage()
            .persistent()
            .get::<_, i128>(&DataKey::Pledge(campaign_id, backer))
            .unwrap_or(0)
    }

    /// Check if a backer has voted on a milestone.
    pub fn has_voted(env: Env, campaign_id: u32, milestone_index: u32, backer: Address) -> bool {
        env.storage()
            .persistent()
            .has(&DataKey::Voted(campaign_id, milestone_index, backer))
    }
}

#[cfg(test)]
mod test;
