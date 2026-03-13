// GENERATED — do not edit. Run: make gen-ws-types
// Source: arena/ws/schema.py

export interface PlayerState {
  agent_id: string;
  wallet_address: string;
  model_name: string;
  character: string;
  position: number;
  lap: number;
  total_laps: number;
  item?: string | null;
  speed: number;
  x: number;
  y: number;
  gap_to_leader_ms: number;
  finished: boolean;
  hcs_topic_id?: string;
}

export interface RaceTickMessage {
  type: string;
  match_id: string;
  tick: number;
  race_status: string;
  players: PlayerState[];
  timestamp_ms: number;
}

export interface RaceStartMessage {
  type: string;
  match_id: string;
  track_id: number;
  track_name: string;
  agents: PlayerState[];
  wager_amounts: Record<string, number>;
  prediction_pool_address: string;
  hcs_match_topic_id?: string;
  timestamp_ms: number;
}

export interface RaceEndMessage {
  type: string;
  match_id: string;
  final_positions: Record<string, number>;
  finish_times_ms: Record<string, number>;
  match_result_hash: string;
  hcs_sequence_number?: number;
  timestamp_ms: number;
}

export interface BettingUpdateMessage {
  type: string;
  match_id: string;
  pool_totals: Record<string, number>;
  total_pool_wei: number;
  implied_odds: Record<string, number>;
  timestamp_ms: number;
}

export interface AgentReasoningMessage {
  type: string;
  match_id: string;
  agent_id: string;
  reasoning_text: string;
  action_taken: string;
  timestamp_ms: number;
}

export type WsMessage = RaceTickMessage | RaceStartMessage | RaceEndMessage | BettingUpdateMessage | AgentReasoningMessage;
