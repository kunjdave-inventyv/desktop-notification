// src/app/services/livekit.service.ts

import { Injectable } from '@angular/core';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  RemoteTrackPublication,
  RemoteTrack,
  createLocalAudioTrack,
  createLocalVideoTrack,
  ConnectionState,
  LocalVideoTrack,
  LocalAudioTrack,
} from 'livekit-client';
import { BehaviorSubject } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class LiveKitService {

  private room: Room | null = null;
  private localVideoTrack: LocalVideoTrack | null = null;
  private localAudioTrack: LocalAudioTrack | null = null;

  public remoteVideoTracks$ = new BehaviorSubject<{ identity: string, track: RemoteTrack }[]>([]);
  public localVideoTrack$ = new BehaviorSubject<LocalVideoTrack | null>(null);

  // ── Connect to a LiveKit room ─────────────────────────────────────────────

  async connect(url: string, token: string, video: boolean = false): Promise<void> {
    await this.disconnect();

    this.room = new Room({
      adaptiveStream: true,
      dynacast: true,
    });

    this.attachRoomListeners(this.room);

    await this.room.connect(url, token);

    // Publish local microphone audio
    this.localAudioTrack = await createLocalAudioTrack({
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });

    await this.room.localParticipant.publishTrack(this.localAudioTrack);

    // Publish local video based on flag
    if (video) {
      try {
        this.localVideoTrack = await createLocalVideoTrack({
          facingMode: 'user',
          resolution: { width: 640, height: 480, frameRate: 15 } // keep low resolution for stability
        });
        await this.room.localParticipant.publishTrack(this.localVideoTrack);
        this.localVideoTrack$.next(this.localVideoTrack);
      } catch (e) {
        console.error('[livekit] failed to publish video', e);
      }
    }

    console.log('[livekit] Connected to room:', this.room.name);
  }

  // ── Disconnect and clean up ───────────────────────────────────────────────

  async disconnect(): Promise<void> {
    if (!this.room) return;

    if (this.localVideoTrack) {
      this.localVideoTrack.stop();
      this.localVideoTrack = null;
    }
    this.localVideoTrack$.next(null);
    this.remoteVideoTracks$.next([]);

    if (this.localAudioTrack) {
      this.localAudioTrack.stop();
      this.localAudioTrack = null;
    }

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

  // ── Camera enable / disable ───────────────────────────────────────────────

  async setCameraEnabled(enabled: boolean): Promise<void> {
    if (!this.room) return;
    await this.room.localParticipant.setCameraEnabled(enabled);

    // Update the next subject state for local track based on the published tracks map
    this.room.localParticipant.tracks.forEach(pub => {
      if (pub.source === Track.Source.Camera) {
        if (enabled && pub.track) {
          this.localVideoTrack$.next(pub.track as LocalVideoTrack);
        } else {
          this.localVideoTrack$.next(null);
        }
      }
    })
  }

  get isCameraEnabled(): boolean {
    if (!this.room) return false;
    let enabled = false;
    this.room.localParticipant.tracks.forEach(pub => {
      if (pub.source === Track.Source.Camera) {
        enabled = !pub.isMuted;
      }
    });
    return enabled;
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
      if (track.kind === Track.Kind.Audio) {
        this.attachAudioTrack(track, participant.identity);
      } else if (track.kind === Track.Kind.Video) {
        console.log('[livekit] Video track subscribed', participant.identity);
        const current = this.remoteVideoTracks$.value;
        if (!current.some(t => t.identity === participant.identity)) {
          this.remoteVideoTracks$.next([...current, { identity: participant.identity, track }]);
        }
      }
    });

    room.on(RoomEvent.TrackUnsubscribed, (
      track: RemoteTrack,
      _pub: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      if (track.kind === Track.Kind.Audio) {
        this.removeAudioElement(participant.identity);
      } else if (track.kind === Track.Kind.Video) {
        console.log('[livekit] Video track unsubscribed', participant.identity);
        const current = this.remoteVideoTracks$.value;
        this.remoteVideoTracks$.next(current.filter(t => t.identity !== participant.identity));
      }
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      this.removeAudioElement(participant.identity);
      const current = this.remoteVideoTracks$.value;
      this.remoteVideoTracks$.next(current.filter(t => t.identity !== participant.identity));
      console.log('[livekit] Participant left:', participant.identity);
    });

    room.on(RoomEvent.Disconnected, () => {
      console.log('[livekit] Room disconnected');
      document.querySelectorAll('audio[data-livekit]').forEach(el => el.remove());
      this.remoteVideoTracks$.next([]);
      this.localVideoTrack$.next(null);
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