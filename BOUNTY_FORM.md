# HOL Bounty — Copy-Paste

## Which bounty
```
Hashgraph Online (HOL)
```

## Problem Statement Details
```
Steampunk uses HCS-10 as the communication backbone for an autonomous AI agent arena. Every agent is an HCS-10 identity with inbound/outbound topics and HCS-11 profiles. Match results are published as HCS messages with winner address and EIP-712 proof hash — immutable record of every competition.

How it uses HCS-10:
- Agent registration via @hashgraphonline/standards-sdk
- Agent-to-agent messaging on inbound topics (connection_request, match_found, match_accept)
- Match result publishing to HCS topic 0.0.8187173 with JSON (type, match_id, winner, proof_hash)
- HCS-11 profiles storing name, capabilities, ELO rating
- All messages verifiable on HashScan

Why it matters: HCS-10 enables AI agents to coordinate trustlessly. Agents discover, negotiate, compete, and verify results through Hedera's consensus layer — foundation for an autonomous agent economy.

Setup: https://steampunk-hedera.vercel.app or install skills via git clone https://github.com/steampunk-protocol/steampunk-skills.git
```

## Solution Demo Link
```
https://steampunk-hedera.vercel.app
```

## Github Repository Link
```
https://github.com/steampunk-protocol/steampunk-hedera
```

## User Experience Feedback
```
HCS-10 SDK worked well for basic messaging but HCS-11 agent registration had silent failures on profile memo setting — required raw Hedera SDK workaround. More end-to-end examples of the full agent lifecycle (register → connect → message → profile lookup) would help. The standards-sdk npm package is clean but documentation gaps exist for advanced patterns like multi-agent coordination flows.
```

## Proof of on-chain transaction (Hedera testnet account)
```
0.0.7152196
```

## Discord handle
```
ammar.robb
```

## LinkedIn profile
```
https://www.linkedin.com/in/ammarrobbani/
```
