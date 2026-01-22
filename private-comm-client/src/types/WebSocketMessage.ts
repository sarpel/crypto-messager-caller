export type MessageType =
  | 'encrypted_message'
  | 'call_offer'
  | 'call_answer'
  | 'ice_candidate'
  | 'call_reject'
  | 'call_end';

export interface EncryptedMessage {
  type: 'encrypted_message';
  recipient_id: string;
  payload: string;
}

export interface CallOffer {
  type: 'call_offer';
  recipient_id: string;
  sdp: string;
}

export interface CallAnswer {
  type: 'call_answer';
  recipient_id: string;
  sdp: string;
}

export interface ICECandidate {
  type: 'ice_candidate';
  recipient_id: string;
  candidate: string;
  sdpMid?: string;
  sdpMLineIndex?: number;
}

export interface CallReject {
  type: 'call_reject';
  recipient_id: string;
}

export interface CallEnd {
  type: 'call_end';
  recipient_id: string;
}

export type WebSocketMessage =
  | EncryptedMessage
  | CallOffer
  | CallAnswer
  | ICECandidate
  | CallReject
  | CallEnd;
