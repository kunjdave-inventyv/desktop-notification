// import { Injectable, signal } from '@angular/core';

// export interface Session {
//   userId: string;
//   peerId: string;
//   autoAction: string | null;
// }

// @Injectable({
//   providedIn: 'root'
// })
// export class SessionService {
//   session = signal<Session | null>(null);

//   setSession(userId: string, peerId: string, autoAction: string | null = null): void {
//     this.session.set({ userId, peerId, autoAction });
//   }

//   clearSession(): void {
//     this.session.set(null);
//   }
// }
import { Injectable, signal } from '@angular/core';

export interface Session {
  userId:     string;
  peerId:     string;
  autoAction: string | null;
}

@Injectable({ providedIn: 'root' })
export class SessionService {
  session = signal<Session | null>(null);

  setSession(userId: string, peerId: string, autoAction: string | null = null): void {
    this.session.set({ userId, peerId, autoAction });
  }

  clearSession(): void {
    this.session.set(null);
  }
}