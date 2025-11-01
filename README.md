# 🏫 NFT-Funded School Infrastructure Network

Welcome to a revolutionary Web3 platform that empowers global communities to fund and transparently track school infrastructure projects in developing regions! Using the Stacks blockchain and Clarity smart contracts, this project leverages NFTs to raise funds, ensures accountable spending through on-chain milestones, and solves real-world problems like lack of transparency in charitable donations, inefficient fund allocation, and limited access to education infrastructure in underserved areas.

## ✨ Features

📈 Sell unique NFTs to raise funds for specific school projects  
💰 Automated fund pooling and milestone-based releases  
🔍 On-chain progress tracking with verifiable updates  
🗳️ Community governance for project proposals and approvals  
🌍 Focus on developing regions (e.g., sub-Saharan Africa, Southeast Asia)  
✅ Immutable audit trails for donors and stakeholders  
🎁 Donor perks like exclusive NFT airdrops or voting rights  
🚫 Fraud prevention through oracle-verified real-world progress  

## 🛠 How It Works

**For Donors/Investors**  
- Browse active school project proposals on the dApp.  
- Purchase NFTs representing "shares" in a project (e.g., digital art depicting the school's impact).  
- Funds from NFT sales go into a secure on-chain pool.  
- Track progress in real-time via the dashboard—see milestones unlocked and funds released.  
- Earn rewards, like governance tokens, for long-term holders.  

**For Project Organizers (NGOs or Local Communities)**  
- Submit a project proposal with details like location, budget, and milestones (e.g., "Build classrooms: $50K").  
- Once approved by community vote, launch an NFT collection tied to the project.  
- Update progress on-chain with evidence (e.g., photos hashed and submitted via oracle).  
- Funds are released automatically upon verified milestone completion.  

**For Verifiers/Auditors**  
- Use query functions to view project details, fund flows, and progress logs.  
- External oracles feed real-world data (e.g., satellite imagery or on-site reports) for validation.  

This setup ensures every dollar is traceable, reducing corruption and building donor trust—ultimately helping build schools, libraries, and tech labs where they're needed most!

## 📜 Smart Contracts Overview

The project is built with 8 Clarity smart contracts for modularity, security, and scalability on Stacks. Each handles a specific aspect to keep things efficient and auditable. Here's a high-level breakdown:

1. **NFT-Minter.clar**: Manages minting, transferring, and metadata for project-specific NFTs. Includes functions like `mint-nft` (for donors) and `get-nft-details` for ownership verification.  

2. **Funding-Pool.clar**: Acts as an escrow for funds raised from NFT sales. Features `deposit-funds` (from sales) and `withdraw-for-milestone` (only callable by authorized contracts).  

3. **Project-Proposal.clar**: Handles submission and storage of project details. Includes `submit-proposal` (with budget, location, milestones) and `get-proposal-info` for public queries.  

4. **Governance-DAO.clar**: Enables community voting on proposals using governance tokens (earned via NFTs). Functions like `vote-on-proposal` and `tally-votes` ensure democratic approval.  

5. **Milestone-Tracker.clar**: Tracks project progress on-chain. Includes `update-milestone` (submit proof hash) and `verify-milestone` to check completion status.  

6. **Fund-Releaser.clar**: Automates fund disbursements based on milestones. Uses `release-funds` (triggered by verified milestones) to send STX or tokens to project wallets.  

7. **Oracle-Verifier.clar**: Integrates external data feeds for real-world validation (e.g., progress reports). Features `submit-oracle-data` and `validate-proof` to prevent tampering.  

8. **Reward-Distributor.clar**: Manages donor incentives. Includes `claim-rewards` for NFT holders and `airdrop-tokens` for milestones achieved.  

These contracts interact seamlessly—for example, NFT sales in NFT-Minter trigger deposits to Funding-Pool, which Fund-Releaser draws from after Milestone-Tracker confirms progress. Deploy them on Stacks for Bitcoin-secured transparency!

## 🚀 Getting Started

- Clone the repo and install Clarity tools.  
- Deploy contracts to Stacks testnet.  
- Build a frontend dApp with React or Hiro Wallet integration for user interactions.  
- Test end-to-end: Propose a project, sell NFTs, update milestones, and release funds.  

Join the movement to educate the world, one block at a time! 🌟