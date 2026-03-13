/**
 * hcs10_client.ts — Shared HCS-10 Connection Infrastructure
 *
 * Wraps @hashgraphonline/standards-sdk HCS10Client with
 * convenience methods for the Agent Colosseum protocol.
 */

import { HCS10Client, type HCSMessage } from "@hashgraphonline/standards-sdk";
import type { AgentMessage } from "./types.js";

// Re-export the raw HCSMessage for consumers that need it
export type { HCSMessage };

export interface HCS10AgentClientConfig {
  operatorId: string;
  operatorKey: string;
  network: "testnet" | "mainnet";
  /** Key type: "ecdsa" for ECDSA secp256k1, "ed25519" for ED25519 DER-encoded. Auto-detected if omitted. */
  keyType?: "ecdsa" | "ed25519";
}

export interface ConnectionRequest {
  requestorAccountId: string;
  requestId: number;
  memo: string;
  timestamp: string;
}

export interface ResolvedMessage {
  data: string;
  sequenceNumber: number;
  timestamp: string;
  payer: string;
  op: string;
}

export class HCS10AgentClient {
  private sdk: HCS10Client;
  private operatorId: string;

  constructor(config: HCS10AgentClientConfig) {
    this.operatorId = config.operatorId;
    const rawKey = config.operatorKey.replace(/^0x/, "");
    // Auto-detect key type: DER-encoded ED25519 keys start with "302e"
    const keyType = config.keyType ?? (rawKey.startsWith("302e") ? "ed25519" : "ecdsa");
    this.sdk = new HCS10Client({
      network: config.network,
      operatorId: config.operatorId,
      operatorPrivateKey: rawKey,
      keyType,
      logLevel: "error",
    } as any);
  }

  /** Expose the underlying SDK client for advanced use */
  getRawClient(): HCS10Client {
    return this.sdk;
  }

  /**
   * Poll an inbound topic for connection_request messages.
   * Optionally filter to only messages after a given consensus timestamp.
   */
  async pollInbound(topicId: string, since?: string): Promise<ConnectionRequest[]> {
    const { messages } = await this.sdk.getMessages(topicId);

    const requests: ConnectionRequest[] = [];
    for (const msg of messages) {
      if (msg.op !== "connection_request") continue;

      const ts = msg.consensus_timestamp ?? "";
      if (since && ts <= since) continue;

      requests.push({
        requestorAccountId: msg.requesting_account_id ?? msg.payer,
        requestId: msg.sequence_number,
        memo: msg.m ?? msg.data ?? "",
        timestamp: ts,
      });
    }

    return requests;
  }

  /**
   * Accept a connection request. Creates a shared connection topic and
   * confirms the connection on the inbound topic.
   *
   * Returns the connection topic ID.
   */
  async acceptConnection(
    inboundTopicId: string,
    requestorAccountId: string,
    requestId: number,
  ): Promise<string> {
    const result = await this.sdk.handleConnectionRequest(
      inboundTopicId,
      requestorAccountId,
      requestId,
    );
    return result.connectionTopicId;
  }

  /**
   * Send a structured AgentMessage (or arbitrary object) on a connection topic.
   * Serializes the payload to JSON automatically.
   */
  async sendMessage(connectionTopicId: string, payload: AgentMessage | object): Promise<void> {
    const data = typeof payload === "string" ? payload : JSON.stringify(payload);
    await this.sdk.sendMessage(connectionTopicId, data);
  }

  /**
   * Get messages from a topic, resolving any HCS-1 inscribed content (>1KB).
   * Optionally filter to messages after a given consensus timestamp.
   */
  async getMessages(topicId: string, afterTimestamp?: string): Promise<ResolvedMessage[]> {
    const { messages } = await this.sdk.getMessages(topicId);

    const resolved: ResolvedMessage[] = [];
    for (const msg of messages) {
      const ts = msg.consensus_timestamp ?? "";
      if (afterTimestamp && ts <= afterTimestamp) continue;

      // Resolve HCS-1 inscribed content if the data is an HRL reference
      let data = msg.data ?? "";
      try {
        data = await this.sdk.getMessageContent(data);
      } catch {
        // If resolution fails, use raw data
      }

      resolved.push({
        data,
        sequenceNumber: msg.sequence_number,
        timestamp: ts,
        payer: msg.payer,
        op: msg.op,
      });
    }

    return resolved;
  }

  /**
   * Request a connection to another agent's inbound topic.
   * Returns the sequence number of the connection request (used as requestId).
   */
  async requestConnection(
    targetInboundTopicId: string,
    memo: string,
  ): Promise<{ requestId: number }> {
    const receipt = await this.sdk.submitConnectionRequest(targetInboundTopicId, memo);
    // The sequence number from the receipt is the requestId
    const seqNum = (receipt as any).topicSequenceNumber;
    const requestId = typeof seqNum === "object" && seqNum?.toNumber
      ? seqNum.toNumber()
      : Number(seqNum ?? 0);
    return { requestId };
  }

  /**
   * Wait for a connection request to be confirmed by the target agent.
   * Returns the connection topic ID once confirmed.
   */
  async waitForConnectionConfirmation(
    inboundTopicId: string,
    requestId: number,
    maxAttempts = 20,
    delayMs = 3000,
  ): Promise<string> {
    const result = await this.sdk.waitForConnectionConfirmation(
      inboundTopicId,
      requestId,
      maxAttempts,
      delayMs,
    );
    return result.connectionTopicId;
  }
}
