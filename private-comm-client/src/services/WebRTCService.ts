import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  mediaDevices,
  MediaStream,
} from 'react-native-webrtc';
import { EventEmitter } from 'events';
import { webSocketService } from './WebSocketService';
import { apiService } from './ApiService';

export type CallState = 'idle' | 'outgoing' | 'incoming' | 'connected' | 'ended';

export interface CallCallbacks {
  onStateChange: (state: CallState) => void;
  onRemoteStream: (stream: MediaStream) => void;
}

export interface TurnCredentials {
  urls: string[];
  username: string;
  credential: string;
}

class WebRTCService extends EventEmitter {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private currentCallId: string | null = null;
  private state: CallState = 'idle';
  private callbacks: CallCallbacks | null = null;
  private turnCredentials: TurnCredentials | null = null;

  setCallbacks(callbacks: CallCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Fetch TURN credentials from the server
   * This should be called before initiating calls
   */
  async fetchTurnCredentials(): Promise<void> {
    try {
      // TODO: Add endpoint on server to provide TURN credentials
      // For now, use environment variables or secure config
      console.log('TURN credentials should be fetched from server');
      // this.turnCredentials = await apiService.getTurnCredentials();
    } catch (error) {
      console.error('Failed to fetch TURN credentials:', error);
    }
  }

  private getIceServers(): RTCConfiguration['iceServers'] {
    const servers: RTCConfiguration['iceServers'] = [
      { urls: 'stun:stun.l.google.com:19302' },
    ];

    // Add TURN servers if credentials are available
    if (this.turnCredentials) {
      for (const url of this.turnCredentials.urls) {
        servers.push({
          urls: url,
          username: this.turnCredentials.username,
          credential: this.turnCredentials.credential,
        });
      }
    } else {
      console.warn('TURN credentials not loaded - NAT traversal may fail');
    }

    return servers;
  }

  private async createPeerConnection(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({
      iceServers: this.getIceServers(),
      iceCandidatePoolSize: 10,
    });

    pc.addEventListener('icecandidate', (event) => {
      if (event.candidate && this.currentCallId) {
        webSocketService.send({
          type: 'ice_candidate',
          recipient_id: this.currentCallId,
          candidate: event.candidate.toJSON(),
        });
      }
    });

    pc.addEventListener('track', (event) => {
      if (event.streams && event.streams[0]) {
        this.remoteStream = event.streams[0];
        this.callbacks?.onRemoteStream(this.remoteStream);
        this.emit('remoteStream', this.remoteStream);
      }
    });

    pc.addEventListener('connectionstatechange', () => {
      console.log('Connection state:', pc.connectionState);

      if (pc.connectionState === 'connected') {
        this.state = 'connected';
        this.callbacks?.onStateChange('connected');
        this.emit('stateChange', 'connected');
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
        this.endCall();
      }
    });

    pc.addEventListener('iceconnectionstatechange', () => {
      console.log('ICE connection state:', pc.iceConnectionState);
      if (pc.iceConnectionState === 'failed') {
        this.emit('iceFailure');
        this.endCall();
      }
    });

    return pc;
  }

  async startCall(recipientId: string): Promise<void> {
    if (this.state !== 'idle') {
      throw new Error(`Cannot start call in state: ${this.state}`);
    }

    // Ensure TURN credentials are loaded
    if (!this.turnCredentials) {
      await this.fetchTurnCredentials();
    }

    try {
      this.currentCallId = recipientId;
      this.state = 'outgoing';
      this.callbacks?.onStateChange('outgoing');
      this.emit('stateChange', 'outgoing');

      this.localStream = await mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });

      this.peerConnection = await this.createPeerConnection();

      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      const offer = await this.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: false,
      });

      await this.peerConnection.setLocalDescription(offer);

      webSocketService.send({
        type: 'call_offer',
        recipient_id: recipientId,
        sdp: offer.sdp,
      });
    } catch (error) {
      console.error('Failed to start call:', error);
      this.state = 'ended';
      this.callbacks?.onStateChange('ended');
      this.emit('error', error);
      this.endCall();
      throw error;
    }
  }

  async handleIncomingOffer(senderId: string, sdp: string): Promise<void> {
    if (this.state !== 'idle') {
      console.warn('Rejecting call - already in a call');
      this.sendReject(senderId);
      return;
    }

    // Ensure TURN credentials are loaded
    if (!this.turnCredentials) {
      await this.fetchTurnCredentials();
    }

    try {
      this.currentCallId = senderId;
      this.state = 'incoming';
      this.callbacks?.onStateChange('incoming');
      this.emit('stateChange', 'incoming');
      this.emit('incomingCall', senderId);

      this.localStream = await mediaDevices.getUserMedia({
        audio: true,
        video: false,
      });

      this.peerConnection = await this.createPeerConnection();

      this.localStream.getTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'offer', sdp })
      );

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      webSocketService.send({
        type: 'call_answer',
        recipient_id: senderId,
        sdp: answer.sdp,
      });
    } catch (error) {
      console.error('Failed to handle offer:', error);
      this.state = 'ended';
      this.callbacks?.onStateChange('ended');
      this.emit('error', error);
      this.endCall();
    }
  }

  async handleAnswer(sdp: string): Promise<void> {
    if (!this.peerConnection) {
      console.warn('Received answer but no peer connection');
      return;
    }

    try {
      await this.peerConnection.setRemoteDescription(
        new RTCSessionDescription({ type: 'answer', sdp })
      );
    } catch (error) {
      console.error('Failed to handle answer:', error);
      this.emit('error', error);
    }
  }

  async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.peerConnection) {
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.error('Failed to add ICE candidate:', error);
      this.emit('error', error);
    }
  }

  sendReject(recipientId: string): void {
    webSocketService.send({
      type: 'call_reject',
      recipient_id: recipientId,
    });
  }

  endCall(): void {
    if (this.currentCallId) {
      webSocketService.send({
        type: 'call_end',
        recipient_id: this.currentCallId,
      });
    }

    this.localStream?.getTracks().forEach((track) => track.stop());
    this.peerConnection?.close();

    this.localStream = null;
    this.remoteStream = null;
    this.peerConnection = null;
    this.currentCallId = null;
    this.state = 'ended';
    this.callbacks?.onStateChange('ended');
    this.emit('stateChange', 'ended');
  }

  toggleMute(): boolean {
    if (!this.localStream) {
      return false;
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    if (!audioTrack) {
      return false;
    }

    audioTrack.enabled = !audioTrack.enabled;
    this.emit('muteChanged', !audioTrack.enabled);
    return !audioTrack.enabled;
  }

  isMuted(): boolean {
    if (!this.localStream) {
      return false;
    }

    const audioTrack = this.localStream.getAudioTracks()[0];
    return audioTrack ? !audioTrack.enabled : false;
  }

  getState(): CallState {
    return this.state;
  }

  getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  /**
   * Set TURN credentials manually (for testing or alternative configuration)
   */
  setTurnCredentials(credentials: TurnCredentials): void {
    this.turnCredentials = credentials;
  }
}

export const webRTCService = new WebRTCService();
