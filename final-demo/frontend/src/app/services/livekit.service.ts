// src/app/services/livekit.service.ts
// Audio-only LiveKit integration — compatible with livekit-client@1.15.6

import { Injectable } from '@angular/core';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  createLocalAudioTrack,
  ConnectionState,
} from 'livekit-client';

@Injectable({ providedIn: 'root' })
export class LiveKitService {

  private room: Room | null = null;

  // ── Connect to a LiveKit room ─────────────────────────────────────────────

  async connect(url: string, token: string): Promise<void> {
    await this.disconnect();

    this.room = new Room({
      adaptiveStream: false,
      dynacast:       false,
    });

    this.attachRoomListeners(this.room);

    await this.room.connect(url, token);

    // Publish local microphone audio
    const audioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl:  true,
    });

    await this.room.localParticipant.publishTrack(audioTrack);

    console.log('[livekit] Connected to room:', this.room.name);
  }

  // ── Disconnect and clean up ───────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (!this.room) return;

    // v1.x API: local tracks are in the `tracks` Map (not trackPublications)
    this.room.localParticipant.tracks.forEach(pub => {
      pub.track?.stop();
    });

    await this.room.disconnect();
    this.room = null;

    document.querySelectorAll('audio[data-livekit]').forEach(el => el.remove());

    console.log('[livekit] Disconnected and cleaned up');
  }

  // ── Mute / unmute local mic ───────────────────────────────────────────────

  async setMicMuted(muted: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setMicrophoneEnabled(!muted);
  }

  get isMuted(): boolean {
    if (!this.room) return true;
    // v1.x API: use `tracks` map and filter by source
    let muted = true;
    this.room.localParticipant.tracks.forEach(pub => {
      if (pub.source === Track.Source.Microphone) {
        muted = pub.isMuted;
      }
    });
    return muted;
  }

  get isConnected(): boolean {
    return this.room?.state === ConnectionState.Connected;
  }

  // ── Room event listeners ──────────────────────────────────────────────────

  private attachRoomListeners(room: Room): void {

    room.on(RoomEvent.TrackSubscribed, (
      track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind !== Track.Kind.Audio) return;
      this.attachAudioTrack(track, participant.identity);
    });

    room.on(RoomEvent.TrackUnsubscribed, (
      _track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      this.removeAudioElement(participant.identity);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.removeAudioElement(participant.identity);
      console.log('[livekit] Participant left:', participant.identity);
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('[livekit] Room disconnected');
      document.querySelectorAll('audio[data-livekit]').forEach(el => el.remove());
    });

    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      console.log('[livekit] Connection state:', state);
    });
  }

  // ── Audio element helpers ─────────────────────────────────────────────────

  private attachAudioTrack(track: RemoteTrack, identity: string): void {
    this.removeAudioElement(identity);

    const audio = document.createElement('audio');
    audio.setAttribute('data-livekit', identity);
    audio.autoplay = true;
    audio.style.display = 'none';
    document.body.appendChild(audio);

    track.attach(audio);
    console.log('[livekit] Audio attached for:', identity);
  }

  private removeAudioElement(identity: string): void {
    const el = document.querySelector(`audio[data-livekit="${identity}"]`);
    if (el) {
      (el as HTMLAudioElement).srcObject = null;
      el.remove();
      console.log('[livekit] Audio removed for:', identity);
    }
  }
}